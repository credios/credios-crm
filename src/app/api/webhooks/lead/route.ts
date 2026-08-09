import crypto from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  duplicidadesPendentes,
  interacoes,
  leadPortalTokens,
  leads,
  trackingUnknowns,
  users as usersTable,
  webhookIdempotency,
} from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { capiOnLeadCreated } from "@/lib/capi/dispatch";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { consultarCadastroPfLead } from "@/lib/score/cadastro-pf";
import {
  consultarScoreParaGate,
  dentroCriteriosConsultaScore,
  registrarSupressaoDeConversao,
  registrarSupressaoPorScore,
  scoreLiberaConversao,
  SCORE_MINIMO_REUNIAO,
} from "@/lib/score/gate";
import { formatProperName } from "@/lib/formatters/proper-name";
import { detectarValoresSuspeitos } from "@/lib/leads/valores-suspeitos";
import { sendPortalEmail } from "@/lib/portal/email";
import { generatePortalToken, portalUrl } from "@/lib/portal/token";
import { elegivelAgendaPublica } from "@/lib/agenda/prequal";
import { gerarAgendaToken } from "@/lib/agenda/token";
import { enviarProativoWhatsapp } from "@/lib/whatsapp/proativo";
import {
  sendLeadAssignedEmail,
  sendLeadEnrichedEmail,
  sendNewLeadEmail,
} from "@/lib/notifications/email";
import { contextFromWebhook } from "@/lib/routing/context";
import { realRoutingDeps } from "@/lib/routing/db-deps";
import { aplicarRoteamento } from "@/lib/routing/engine";
import { encerrarCadencia } from "@/lib/cadencia/engine";
import { onLeadStageChange } from "@/lib/google-ads/dispatcher";
import { notifyPartnerPortal } from "@/lib/notifications/portal-webhook";
import { resolveSlaAlertsForLead } from "@/lib/sla/check";
import { isSystemTerminal } from "@/lib/status/canonical";
import { resolveSource } from "@/lib/tracking/resolver";
import { extractTrackingFromUrl } from "@/lib/tracking/url-fallback";
import {
  emptyToNull,
  normalizarCpf,
  normalizarWhatsapp,
  reaisParaCentavos,
  webhookLeadPayloadSchema,
} from "@/lib/validators/webhook";

// Janela de idempotência: 60s. Usado no DELETE de cleanup. Se mudar aqui,
// mude também o INTERVAL no SQL do cleanup abaixo.
const _IDEMPOTENCY_WINDOW_S = 60; // doc only
void _IDEMPOTENCY_WINDOW_S;

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashPayload(body: unknown): string {
  // Top-level keys ordenadas; objetos internos seguem insertion order.
  const obj = (body ?? {}) as Record<string, unknown>;
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
  return crypto.createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

/**
 * Convida o cliente pro portal de documentos quando a simulação é concluída:
 * gera um token, devolve a URL (pra página de sucesso do site) e dispara o
 * e-mail "vamos adiantar sua proposta" — UMA vez por lead (só se ainda não havia
 * token). Pula no enriquecimento parcial/silencioso (notify=false) e quando não
 * há e-mail. Falhas não quebram o webhook.
 */
async function invitePortal(opts: {
  leadId: string;
  nome: string;
  email: string | null;
  notify: boolean | undefined;
}): Promise<string | null> {
  if (opts.notify === false || !opts.email) return null;
  try {
    const prior = await db
      .select({ id: leadPortalTokens.id })
      .from(leadPortalTokens)
      .where(eq(leadPortalTokens.leadId, opts.leadId))
      .limit(1);
    const { token } = await generatePortalToken(opts.leadId);
    const url = portalUrl(token);
    if (prior.length === 0) {
      const email = opts.email;
      after(() => sendPortalEmail({ nome: opts.nome, email, url }));
    }
    return url;
  } catch (err) {
    console.error("[webhook] invitePortal falhou:", err);
    return null;
  }
}

/**
 * Agenda o template proativo da Heloísa SÓ quando a simulação está COMPLETA.
 *
 * "Completa" = tem `objetivoCredito` preenchido. O mini-form da 1ª etapa (money
 * page) captura só nome+telefone+valores e NÃO tem objetivo — então não dispara
 * aqui; quem para na 1ª etapa é alcançado pelo cron (15 min). Já o fluxo único
 * (Google Ads) e o enriquecimento final (etapa 5, notify≠false) chegam completos
 * e disparam na hora. Idempotência fica no claim atômico de enviarProativoWhatsapp.
 * Roda no after() (não bloqueia a resposta do webhook).
 */
/**
 * GATE DE SCORE da agenda pública: com o token candidato em mãos, consulta o
 * score (dedup 30d) e SUPRIME a grade quando score < corte. Sem token mas
 * dentro dos critérios de consulta, consulta em after() (não bloqueia a
 * resposta) — o score fica no CRM pro time analisar. Fail-open em falha.
 *
 * `aguardarScore` força a consulta a ser SÍNCRONA mesmo sem token candidato.
 * Serve ao gate de conversão de mídia (`gate_conversao_score`): ali o site
 * espera a resposta pra decidir se dispara o evento, então o score precisa
 * estar resolvido antes do JSON sair. Fica atrás de flag justamente pra não
 * somar latência aos leads que não precisam dessa decisão — o resto do site
 * segue com a consulta em background, como antes.
 *
 * Devolve o score junto do token porque as duas decisões (agenda e conversão)
 * saem da MESMA consulta — o dedup de 30 dias da Direct Data já garantiria
 * que não pagamos duas vezes, mas devolver evita até a segunda ida ao banco.
 */
async function aplicarGateDeScore(
  lead: { id: string; cpf: string | null; valorImovelCentavos: number | null; valorCreditoCentavos: number | null },
  token: string | null,
  opts: { aguardarScore?: boolean } = {},
): Promise<{ token: string | null; score: number | null }> {
  // Cadastro PF Plus: TODO form completo com CPF (sem critério de valor —
  // consulta barata, decisão do owner). Dedup e falha silenciosa na lib.
  after(() => consultarCadastroPfLead(lead.id));
  if (!dentroCriteriosConsultaScore(lead)) return { token, score: null };
  if (!token && !opts.aguardarScore) {
    after(() => consultarScoreParaGate(lead.id));
    return { token, score: null };
  }
  const score = await consultarScoreParaGate(lead.id);
  if (token && score != null && score < SCORE_MINIMO_REUNIAO) {
    await registrarSupressaoPorScore(lead.id, score, "agenda_publica").catch(() => {});
    return { token: null, score };
  }
  return { token, score };
}

/**
 * Resolve o gate de conversão de mídia a partir do score já consultado.
 *
 * Retorna `undefined` quando o site não pediu o gate — assim o campo some da
 * resposta e o cliente antigo (ou qualquer outra página) segue disparando a
 * conversão como sempre, sem depender desta feature.
 */
async function resolverGateDeConversao(
  leadId: string,
  score: number | null,
  pedido: boolean,
): Promise<boolean | undefined> {
  if (!pedido) return undefined;
  const liberada = scoreLiberaConversao(score);
  if (!liberada && score != null) {
    after(() => registrarSupressaoDeConversao(leadId, score).catch(() => {}));
  }
  return liberada;
}

function agendarProativoSeCompleto(opts: {
  leadId: string;
  nome: string;
  whatsapp: string | null;
  notify: boolean | undefined;
  completo: boolean;
  qualifStatusAtual: string | null;
  /** Lead elegível pra AGENDA PÚBLICA: não dispara na hora — a página de sucesso
   *  mostra a grade de horários; se ele agendar, a qualif vira 'concluida' e o
   *  cron proativo (7 min da oferta) pula; se não agendar, o cron abre a conversa. */
  deferirParaCron?: boolean;
}): void {
  if (opts.notify === false || !opts.completo || !opts.whatsapp || opts.qualifStatusAtual) {
    return;
  }
  if (opts.deferirParaCron) {
    console.log(`[webhook] proativo adiado pro cron (agenda pública): ${opts.leadId}`);
    return;
  }
  after(() =>
    enviarProativoWhatsapp({
      leadId: opts.leadId,
      nome: opts.nome,
      whatsapp: opts.whatsapp,
    }),
  );
}

/**
 * Token da AGENDA PÚBLICA pra tela de sucesso do simulador — só pra lead
 * completo, com notificação ativa e que passa na pré-qualificação determinística
 * (crédito/imóvel/renda/tipo — src/lib/agenda/prequal.ts). Kill switch:
 * AGENDA_PUBLICA=off. Nunca lança (não pode quebrar o webhook).
 */
function tokenAgendaSeElegivel(
  lead: {
    id: string;
    valorCreditoCentavos: number | null;
    valorImovelCentavos: number | null;
    rendaMensalCentavos: number | null;
    tipoImovel: string | null;
    // Composição de renda (regra 5k/8k da política central).
    conjugeCompoeRenda: boolean | null;
    conjugeRendaCentavos: number | null;
  },
  notify: boolean | undefined,
  completo: boolean,
): string | null {
  if (process.env.AGENDA_PUBLICA === "off") return null;
  if (notify === false || !completo) return null;
  if (!elegivelAgendaPublica(lead)) return null;
  try {
    return gerarAgendaToken(lead.id);
  } catch (e) {
    console.error("[webhook] agenda token falhou:", e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  // Rate limit da spec (§10): 60 req/min por IP.
  if (!rateLimit(`webhook:${clientIp(request.headers)}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  // 1. Header secret.
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("[webhook] WEBHOOK_SECRET não configurado");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const providedSecret = request.headers.get("x-webhook-secret");
  if (!providedSecret || !timingSafeEquals(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Parse body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // 3. Validar payload.
  const parsed = webhookLeadPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // eventID do `Lead` que o pixel disparou no browser. Precisa viajar idêntico
  // pra CAPI, senão o Meta conta a conversão duas vezes (ver capiOnLeadCreated).
  // Só chega no envio final do cadastro — ausente no parcial e na recusa.
  const metaEventId = emptyToNull(payload.meta_event_id ?? null);

  // 3b. Enriquecimento de lead parcial (fluxo simulador 2-etapas do site).
  //
  // O site captura nome+telefone+valores numa 1ª etapa (mini-form inline da
  // money page), cria um lead PARCIAL aqui e guarda o leadId retornado. Na 2ª
  // etapa (formulário completo em /simulador), reenvia os dados já com
  // `lead_id` — neste ponto ATUALIZAMOS aquele lead em vez de criar um novo,
  // evitando duplicidade.
  //
  // Premissas:
  //   - Não reclassifica origem nem re-roteia: o lead parcial já foi
  //     classificado e atribuído na criação (1ª etapa).
  //   - Só sobrescreve coluna quando o novo valor está presente (COALESCE):
  //     mantém o que a 1ª etapa já gravou se a 2ª não trouxer o campo.
  //   - lead_id inexistente (sessão antiga, lead apagado) → cai no fluxo
  //     normal de criação abaixo, defensivamente.
  if (payload.lead_id) {
    const [existing] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, payload.lead_id))
      .limit(1);

    if (existing) {
      const setIf = <T>(val: T | null | undefined, current: T): T =>
        val == null ? current : val;

      const cpfClean = normalizarCpf(emptyToNull(payload.cpf ?? null));
      const whatsappClean = normalizarWhatsapp(emptyToNull(payload.whatsapp));
      const valoresSuspeitos = detectarValoresSuspeitos({
        rendaMensal: payload.renda_mensal ?? null,
        valorImovel: payload.valor_imovel ?? null,
        saldoDevedor: payload.saldo_devedor ?? null,
        valorCredito: payload.valor_credito ?? null,
      });

      await db
        .update(leads)
        .set({
          nome: formatProperName(payload.nome),
          cpf: setIf(cpfClean, existing.cpf),
          estadoCivil: setIf(emptyToNull(payload.estado_civil ?? null), existing.estadoCivil),
          ocupacao: setIf(emptyToNull(payload.ocupacao ?? null), existing.ocupacao),
          rendaMensalCentavos: setIf(reaisParaCentavos(payload.renda_mensal), existing.rendaMensalCentavos),
          whatsapp: setIf(whatsappClean, existing.whatsapp),
          email: setIf(emptyToNull(payload.email ?? null), existing.email),
          cidade: setIf(emptyToNull(payload.cidade ?? null), existing.cidade),
          estado: setIf(emptyToNull(payload.estado ?? null)?.toUpperCase() ?? null, existing.estado),
          objetivoCredito: setIf(emptyToNull(payload.objetivo_credito ?? null), existing.objetivoCredito),
          tipoImovel: setIf(emptyToNull(payload.tipo_imovel ?? null), existing.tipoImovel),
          tipoImovelDetalhes: setIf(emptyToNull(payload.tipo_imovel_detalhes ?? null), existing.tipoImovelDetalhes),
          situacaoImovel: setIf(emptyToNull(payload.situacao_imovel ?? null), existing.situacaoImovel),
          tipoPessoa: setIf(emptyToNull(payload.tipo_pessoa ?? null), existing.tipoPessoa),
          valorImovelCentavos: setIf(reaisParaCentavos(payload.valor_imovel), existing.valorImovelCentavos),
          saldoDevedorCentavos: setIf(reaisParaCentavos(payload.saldo_devedor), existing.saldoDevedorCentavos),
          valorCreditoCentavos: setIf(reaisParaCentavos(payload.valor_credito), existing.valorCreditoCentavos),
          // Endereço do imóvel + cônjuge (complemento opcional do simulador).
          imovelCep: setIf(emptyToNull(payload.imovel_cep ?? null), existing.imovelCep),
          imovelLogradouro: setIf(emptyToNull(payload.imovel_logradouro ?? null), existing.imovelLogradouro),
          imovelNumero: setIf(emptyToNull(payload.imovel_numero ?? null), existing.imovelNumero),
          imovelComplemento: setIf(emptyToNull(payload.imovel_complemento ?? null), existing.imovelComplemento),
          imovelBairro: setIf(emptyToNull(payload.imovel_bairro ?? null), existing.imovelBairro),
          conjugeNome: setIf(emptyToNull(payload.conjuge_nome ?? null), existing.conjugeNome),
          conjugeCpf: setIf(normalizarCpf(emptyToNull(payload.conjuge_cpf ?? null)), existing.conjugeCpf),
          conjugeEmail: setIf(emptyToNull(payload.conjuge_email ?? null), existing.conjugeEmail),
          conjugeNascimento: setIf(emptyToNull(payload.conjuge_nascimento ?? null), existing.conjugeNascimento),
          conjugeWhatsapp: setIf(normalizarWhatsapp(emptyToNull(payload.conjuge_whatsapp ?? null)), existing.conjugeWhatsapp),
          conjugeCompoeRenda: setIf(payload.conjuge_compoe_renda ?? null, existing.conjugeCompoeRenda),
          conjugeRendaCentavos: setIf(reaisParaCentavos(payload.conjuge_renda), existing.conjugeRendaCentavos),
          conjugeOcupacao: setIf(emptyToNull(payload.conjuge_ocupacao ?? null), existing.conjugeOcupacao),
          // Cookies do pixel: a 1ª etapa pode ter rodado antes de o fbevents
          // escrever o `_fbc`, então a etapa final ainda pode trazer o valor.
          fbp: setIf(emptyToNull(payload.fbp ?? null), existing.fbp),
          fbc: setIf(emptyToNull(payload.fbc ?? null), existing.fbc),
          valoresSuspeitos: valoresSuspeitos as never,
          // Preserva o payload original da 1ª etapa e anexa o da 2ª, sem perder
          // histórico de atribuição.
          rawPayload: { parcial: existing.rawPayload, completo: body } as never,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, existing.id));

      await db.insert(interacoes).values({
        leadId: existing.id,
        autorId: null,
        tipo: "evento_sistema",
        conteudo: "Lead enriquecido com dados completos do simulador",
        metadata: {} as never,
      });

      // ── Pré-qualificação automática do site ──────────────────────────
      // O /continuar-simulacao recusou o lead (renda/saldo devedor fora da
      // política) DEPOIS de o parcial já existir aqui. Aplica a mesma
      // sequência do endpoint de status (SLA, cadência, portal de parceiros,
      // conversões offline) e retorna cedo: lead recusado não recebe e-mail
      // de enriquecimento, convite de portal, agenda pública nem proativo da
      // Heloísa. Se a equipe já moveu o lead pra um status terminal, não
      // sobrescreve.
      if (payload.auto_desqualificar && payload.motivo_desqualificacao) {
        if (!isSystemTerminal(existing.status)) {
          const [desqualificado] = await db
            .update(leads)
            .set({
              status: "desqualificado",
              motivoDesqualificacao: payload.motivo_desqualificacao,
            })
            .where(eq(leads.id, existing.id))
            .returning();
          await db.insert(interacoes).values({
            leadId: existing.id,
            autorId: null,
            tipo: "mudanca_status",
            conteudo: `Status alterado de ${existing.status} para desqualificado`,
            metadata: {
              de: existing.status,
              para: "desqualificado",
              motivo: payload.motivo_desqualificacao,
              automatico: true,
              origem: "site_prequal",
            } as never,
          });
          await resolveSlaAlertsForLead(existing.id).catch(() => {});
          await encerrarCadencia(existing.id).catch(() => {});
          if (desqualificado) {
            await notifyPartnerPortal(desqualificado, "desqualificado").catch(() => {});
            await onLeadStageChange(desqualificado, "desqualificado").catch(() => {});
          }
          const prequalMeta = extractRequestMeta(request);
          after(() =>
            logAction(
              null,
              null,
              "lead_desqualificado_prequal_site",
              "lead",
              existing.id,
              { motivo: payload.motivo_desqualificacao },
              prequalMeta,
            ),
          );
        }
        return NextResponse.json(
          { leadId: existing.id, enriched: true, desqualificado: true, portalUrl: null, agendaToken: null },
          { status: 200 },
        );
      }

      // E-mail de ENRIQUECIMENTO — conteúdo diferente do "Novo lead" pra não
      // duplicar. Re-busca o lead atualizado pra refletir os dados completos.
      // UM único e-mail combinado pros admins + consultor (deduplicado).
      const [updated] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, existing.id))
        .limit(1);
      const enrichedLead = updated ?? existing;

      const enrichMeta = extractRequestMeta(request);
      after(() =>
        logAction(
          null,
          null,
          "lead_enriquecido_webhook",
          "lead",
          existing.id,
          { origem: "simulador (2a etapa)" },
          enrichMeta,
        ),
      );
      // Enriquecimento parcial (etapa 4 do simulador) chega com notify=false:
      // atualiza o lead em silêncio. O e-mail de "Cadastro completo" sai só no
      // enriquecimento final (etapa 5, notify ausente/true) — evita e-mail dobrado.
      if (payload.notify !== false) {
        after(async () => {
          const admins = await db
            .select({ email: usersTable.email })
            .from(usersTable)
            .where(sql`${usersTable.perfil} = 'admin' AND ${usersTable.ativo} = true`);
          const recipients = admins.map((a) => a.email).filter(Boolean);
          if (enrichedLead.consultorId) {
            const [c] = await db
              .select({ email: usersTable.email })
              .from(usersTable)
              .where(eq(usersTable.id, enrichedLead.consultorId))
              .limit(1);
            if (c?.email) recipients.push(c.email);
          }
          const unique = [...new Set(recipients)];
          if (unique.length > 0) await sendLeadEnrichedEmail(enrichedLead, unique);
        });
      }

      const portalUrlEnriched = await invitePortal({
        leadId: existing.id,
        nome: enrichedLead.nome,
        email: enrichedLead.email,
        notify: payload.notify,
      });

      const gateConversaoPedido = payload.gate_conversao_score === true;
      const { token: agendaTokenEnriched, score: scoreEnriched } =
        await aplicarGateDeScore(
          enrichedLead,
          tokenAgendaSeElegivel(
            enrichedLead,
            payload.notify,
            !!enrichedLead.objetivoCredito,
          ),
          { aguardarScore: gateConversaoPedido },
        );
      const conversaoLiberadaEnriched = await resolverGateDeConversao(
        existing.id,
        scoreEnriched,
        gateConversaoPedido,
      );

      // CAPI `Lead` do fluxo em 2 etapas. É AQUI que a conversão acontece de
      // verdade — o lead parcial criado lá atrás ainda não tinha renda nem
      // saldo devedor, e é neste ponto que ele passou na pré-qualificação (a
      // recusa retornou antes, lá em cima).
      //
      // DEPOIS do gate de score, de propósito: a CAPI dispara independente do
      // browser, então mandá-la antes faria o servidor furar a supressão que
      // o browser acabou de respeitar — o gate viraria decoração.
      //
      // `notify !== false` isola a chamada FINAL: as intermediárias (etapa
      // parcial e recusa) mandam notify:false e são as únicas sem
      // `meta_event_id`. Sem esse filtro o evento sairia duas vezes com ids
      // diferentes — a intermediária com o fallback, a final com o id do
      // browser — e o Meta contaria duas conversões.
      if (payload.notify !== false) {
        after(() =>
          capiOnLeadCreated(enrichedLead, metaEventId, conversaoLiberadaEnriched),
        );
      }
      if (agendaTokenEnriched) {
        // Marca a oferta da agenda — o cron do proativo espera 7 min a partir daqui.
        after(() =>
          db
            .update(leads)
            .set({ agendaOferecidaEm: new Date() })
            .where(eq(leads.id, existing.id)),
        );
      }

      agendarProativoSeCompleto({
        leadId: existing.id,
        nome: enrichedLead.nome,
        whatsapp: enrichedLead.whatsapp,
        notify: payload.notify,
        completo: !!enrichedLead.objetivoCredito,
        qualifStatusAtual: existing.qualifWhatsappStatus,
        deferirParaCron: !!agendaTokenEnriched,
      });

      return NextResponse.json(
        {
          leadId: existing.id,
          enriched: true,
          portalUrl: portalUrlEnriched,
          agendaToken: agendaTokenEnriched,
          // Só presente quando o site pediu o gate (landings de mídia paga).
          // Ausente = dispare a conversão normalmente.
          ...(conversaoLiberadaEnriched !== undefined
            ? { conversaoLiberada: conversaoLiberadaEnriched }
            : {}),
        },
        { status: 200 },
      );
    }
    // lead_id não encontrado → segue para criação normal abaixo.
  }

  // 4. Claim atômico de idempotência (evita race entre 2 webhooks idênticos
  // concorrentes que dariam 2 leads).
  //
  // Estratégia:
  //   a) Cleanup: apaga claims expirados (> janela) — libera o hash pra reuso.
  //      A janela ainda é respeitada porque o cleanup roda DENTRO da request.
  //   b) INSERT ... ON CONFLICT (payload_hash) DO NOTHING RETURNING id.
  //      Se RETURNING vier vazio = duplicate dentro da janela.
  //      Se vier id = ganhamos o claim, somos os únicos a criar o lead.
  //   c) Try criar lead. Em caso de erro, DELETA o claim no catch — assim
  //      um retry imediato pelo caller pode tentar de novo (não fica travado
  //      sem lead_id por 60s).
  const hash = hashPayload(body);

  await db.execute(
    sql`DELETE FROM public.webhook_idempotency WHERE created_at < NOW() - INTERVAL '60 seconds'`,
  );

  const claim = await db
    .insert(webhookIdempotency)
    .values({ payloadHash: hash })
    .onConflictDoNothing({ target: webhookIdempotency.payloadHash })
    .returning({ id: webhookIdempotency.id });

  if (claim.length === 0) {
    // Já existe claim ativo (dentro da janela) — duplicate.
    const [existing] = await db
      .select({ leadId: webhookIdempotency.leadId })
      .from(webhookIdempotency)
      .where(eq(webhookIdempotency.payloadHash, hash))
      .limit(1);
    return NextResponse.json(
      { duplicate: true, leadId: existing?.leadId ?? null },
      { status: 200 },
    );
  }
  const claimId = claim[0]!.id;

  // 5. Normalizar campos.
  const cpfClean = normalizarCpf(emptyToNull(payload.cpf ?? null));
  const whatsappClean = normalizarWhatsapp(emptyToNull(payload.whatsapp));
  const emailClean = emptyToNull(payload.email ?? null);
  const estadoClean = emptyToNull(payload.estado ?? null)?.toUpperCase() ?? null;

  // 5.0. Fallback de sinais pela URL de entrada: navegadores sem cookies
  // (in-app browsers de ChatGPT/YouTube/Instagram, privacidade agressiva)
  // mandam utm/click IDs vazios e classificação "Direct" — mas a
  // pagina_entrada ainda carrega a tag original (?utm_source=...).
  // Auditoria 07/08/2026: 4 leads em 14 dias nesse estado. Sinais explícitos
  // do payload SEMPRE vencem; a URL só preenche o que veio vazio.
  const urlSignals = extractTrackingFromUrl(payload.pagina_entrada ?? null);
  const sig = {
    gclid: emptyToNull(payload.gclid ?? null) ?? urlSignals.gclid ?? null,
    wbraid: emptyToNull(payload.wbraid ?? null) ?? urlSignals.wbraid ?? null,
    gbraid: emptyToNull(payload.gbraid ?? null) ?? urlSignals.gbraid ?? null,
    msclkid: emptyToNull(payload.msclkid ?? null) ?? urlSignals.msclkid ?? null,
    fbclid: emptyToNull(payload.fbclid ?? null) ?? urlSignals.fbclid ?? null,
    ttclid: emptyToNull(payload.ttclid ?? null) ?? urlSignals.ttclid ?? null,
    li_fat_id: emptyToNull(payload.li_fat_id ?? null) ?? urlSignals.li_fat_id ?? null,
    twclid: emptyToNull(payload.twclid ?? null) ?? urlSignals.twclid ?? null,
    rdt_cid: emptyToNull(payload.rdt_cid ?? null) ?? urlSignals.rdt_cid ?? null,
    sccid: emptyToNull(payload.sccid ?? null) ?? urlSignals.sccid ?? null,
    pin_aid: emptyToNull(payload.pin_aid ?? null) ?? urlSignals.pin_aid ?? null,
    epik: emptyToNull(payload.epik ?? null) ?? urlSignals.epik ?? null,
    irclickid: emptyToNull(payload.irclickid ?? null) ?? urlSignals.irclickid ?? null,
    cjevent: emptyToNull(payload.cjevent ?? null) ?? urlSignals.cjevent ?? null,
    utm_source: emptyToNull(payload.utm_source ?? null) ?? urlSignals.utm_source ?? null,
    utm_medium: emptyToNull(payload.utm_medium ?? null) ?? urlSignals.utm_medium ?? null,
    utm_campaign:
      emptyToNull(payload.utm_campaign ?? null) ?? urlSignals.utm_campaign ?? null,
    utm_term: emptyToNull(payload.utm_term ?? null) ?? urlSignals.utm_term ?? null,
    utm_content:
      emptyToNull(payload.utm_content ?? null) ?? urlSignals.utm_content ?? null,
    network: emptyToNull(payload.network ?? null) ?? urlSignals.network ?? null,
  };

  // "Direct" alegado pelo client com a URL de entrada mostrando sinal de
  // tracking é sintoma de cookies bloqueados no navegador do lead — descarta
  // a alegação pra reclassificar do zero com os sinais recuperados. Qualquer
  // outra alegação canônica (ChatGPT, Google Ads...) segue valendo.
  const clientSourceRaw = emptyToNull(payload.source ?? null);
  const clientSource =
    clientSourceRaw === "Direct" && Object.keys(urlSignals).length > 0
      ? null
      : clientSourceRaw;

  // 5.1. Resolver classificação de origem (channel/source/paid).
  // O resolver:
  //   1. Confia em channel/source vindos do client (se canônicos)
  //   2. Reclassifica server-side via classifyTouch se ausentes ou inválidos
  //   3. Valida contra tabela tracking_sources ativos
  //   4. Marca como "Unknown" o que admin precisar revisar (quarantine)
  const classification = await resolveSource({
    clientSource,
    clientChannel: clientSource ? emptyToNull(payload.channel ?? null) : null,
    clientPaid: clientSource ? (payload.paid ?? null) : null,
    gclid: sig.gclid,
    wbraid: sig.wbraid,
    gbraid: sig.gbraid,
    msclkid: sig.msclkid,
    fbclid: sig.fbclid,
    ttclid: sig.ttclid,
    li_fat_id: sig.li_fat_id,
    twclid: sig.twclid,
    rdt_cid: sig.rdt_cid,
    sccid: sig.sccid,
    pin_aid: sig.pin_aid,
    epik: sig.epik,
    irclickid: sig.irclickid,
    cjevent: sig.cjevent,
    utm_source: sig.utm_source,
    utm_medium: sig.utm_medium,
    utm_campaign: sig.utm_campaign,
    network: sig.network,
    referrer: emptyToNull(payload.referrer ?? null),
    referrer_parsed: emptyToNull(payload.referrer_parsed ?? null),
  });

  // ===== Bloco protegido: se qualquer passo falhar, libera o claim =====
  let newLead: typeof leads.$inferSelect;
  let leadExistenteId: string | null = null;
  let routing: Awaited<ReturnType<typeof aplicarRoteamento>>;
  try {
    // 6. Detecção de CPF duplicado (não bloqueia).
    if (cpfClean) {
      const [exist] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.cpf, cpfClean))
        .limit(1);
      if (exist) leadExistenteId = exist.id;
    }

    // 7. Engine de roteamento (CLAUDE.md §6.4).
    routing = await aplicarRoteamento(contextFromWebhook(payload), realRoutingDeps);

    // 7b. Detecção de valores monetários fora do range esperado. Lead é
    // aceito normalmente — admin/gerente revisa via UI no /leads/[id].
    const valoresSuspeitos = detectarValoresSuspeitos({
      rendaMensal: payload.renda_mensal ?? null,
      valorImovel: payload.valor_imovel ?? null,
      saldoDevedor: payload.saldo_devedor ?? null,
      valorCredito: payload.valor_credito ?? null,
    });

    // 8. Insere lead.
    const inserted = await db
      .insert(leads)
      .values({
      // Nome normalizado para Title Case PT-BR — cliente preenche em qualquer
      // caixa ("FABIANA", "fabiana") mas o lead fica salvo na forma canônica
      // ("Fabiana"). Uniformiza títulos no kanban/lista e evita "Olá, FABIANA"
      // nas mensagens prontas.
      nome: formatProperName(payload.nome),
      cpf: cpfClean,
      estadoCivil: emptyToNull(payload.estado_civil ?? null),
      ocupacao: emptyToNull(payload.ocupacao ?? null),
      rendaMensalCentavos: reaisParaCentavos(payload.renda_mensal),
      whatsapp: whatsappClean,
      email: emailClean,
      cidade: emptyToNull(payload.cidade ?? null),
      estado: estadoClean,
      produto: payload.produto ?? "CGI",
      objetivoCredito: emptyToNull(payload.objetivo_credito ?? null),
      tipoImovel: emptyToNull(payload.tipo_imovel ?? null),
      tipoImovelDetalhes: emptyToNull(payload.tipo_imovel_detalhes ?? null),
      situacaoImovel: emptyToNull(payload.situacao_imovel ?? null),
      tipoPessoa: emptyToNull(payload.tipo_pessoa ?? null),
      valorImovelCentavos: reaisParaCentavos(payload.valor_imovel),
      saldoDevedorCentavos: reaisParaCentavos(payload.saldo_devedor),
      valorCreditoCentavos: reaisParaCentavos(payload.valor_credito),
      // ── Endereço do imóvel + cônjuge (complemento opcional do simulador) ─
      imovelCep: emptyToNull(payload.imovel_cep ?? null),
      imovelLogradouro: emptyToNull(payload.imovel_logradouro ?? null),
      imovelNumero: emptyToNull(payload.imovel_numero ?? null),
      imovelComplemento: emptyToNull(payload.imovel_complemento ?? null),
      imovelBairro: emptyToNull(payload.imovel_bairro ?? null),
      conjugeNome: emptyToNull(payload.conjuge_nome ?? null),
      conjugeCpf: normalizarCpf(emptyToNull(payload.conjuge_cpf ?? null)),
      conjugeEmail: emptyToNull(payload.conjuge_email ?? null),
      conjugeNascimento: emptyToNull(payload.conjuge_nascimento ?? null),
      conjugeWhatsapp: normalizarWhatsapp(emptyToNull(payload.conjuge_whatsapp ?? null)),
      conjugeCompoeRenda: payload.conjuge_compoe_renda ?? null,
      conjugeRendaCentavos: reaisParaCentavos(payload.conjuge_renda),
      conjugeOcupacao: emptyToNull(payload.conjuge_ocupacao ?? null),
      // ── Parceria (Portal de Parceiros) ──────────────────────────────────
      parceiroNome: emptyToNull(payload.parceiro_nome ?? null),
      parceiroPortalId: emptyToNull(payload.parceiro_portal_id ?? null),
      observacoesParceiro: emptyToNull(payload.observacoes_parceiro ?? null),
      // Flag de revisão (migration 0025). Drizzle jsonb aceita objeto JS.
      valoresSuspeitos: valoresSuspeitos as never,
      consultorId: routing.consultorId,
      atribuidoEm: routing.consultorId ? new Date() : null,
      // ── Tracking canônico (taxonomia hierárquica, migration 0017) ──────
      channel: classification.channel,
      source: classification.source,
      paid: classification.paid,
      // Mirror do source pro campo legado `origem` (retrocompatibilidade
      // com filtros/relatórios que ainda usam `origem`). Será deprecated
      // depois que toda UI migrar.
      origem: classification.source,
      touches: (payload.touches ?? null) as never,
      // Colunas de tracking usam `sig` (payload com fallback da URL de
      // entrada) — persiste o sinal recuperado, não o vazio original.
      utmSource: sig.utm_source,
      utmMedium: sig.utm_medium,
      utmCampaign: sig.utm_campaign,
      utmTerm: sig.utm_term,
      utmContent: sig.utm_content,
      gclid: sig.gclid,
      fbclid: sig.fbclid,
      msclkid: sig.msclkid,
      ttclid: sig.ttclid,
      wbraid: sig.wbraid,
      gbraid: sig.gbraid,
      liFatId: sig.li_fat_id,
      twclid: sig.twclid,
      rdtCid: sig.rdt_cid,
      sccid: sig.sccid,
      pinAid: sig.pin_aid,
      epik: sig.epik,
      irclickid: sig.irclickid,
      cjevent: sig.cjevent,
      // Cookies do pixel (migration 0047) — fora do `sig` porque não existem
      // na URL: ou o fbevents os escreveu no browser, ou não temos.
      fbp: emptyToNull(payload.fbp ?? null),
      fbc: emptyToNull(payload.fbc ?? null),
      rede: emptyToNull(payload.rede ?? null),
      dispositivo: emptyToNull(payload.dispositivo ?? null),
      palavraChave: emptyToNull(payload.palavra_chave ?? null),
      grupoAnuncios: emptyToNull(payload.grupo_anuncios ?? null),
      criativo: emptyToNull(payload.criativo ?? null),
      tipoCorrespondencia: emptyToNull(payload.tipo_correspondencia ?? null),
      referrer: emptyToNull(payload.referrer ?? null),
      paginaEntrada: emptyToNull(payload.pagina_entrada ?? null),
      rawPayload: body as never,
    })
    .returning();
    newLead = inserted[0]!;

    // 8.1. Quarantine: se a classificação resultou em "Unknown" (source
    // desconhecido apesar de ter algum sinal), salva pra admin revisar
    // em /configuracoes/tracking. Sem isso, admins descobririam tarde
    // demais que tem leads com source vazio na UI.
    if (classification.source === "Unknown" || !classification.active_in_db) {
      await db.insert(trackingUnknowns).values({
        leadId: newLead.id,
        rawOrigem: emptyToNull(payload.origem ?? null),
        rawReferrer: emptyToNull(payload.referrer ?? null),
        rawUtmSource: emptyToNull(payload.utm_source ?? null),
        rawUtmMedium: emptyToNull(payload.utm_medium ?? null),
        rawUtmCampaign: emptyToNull(payload.utm_campaign ?? null),
        rawClickIds: {
          gclid: payload.gclid,
          fbclid: payload.fbclid,
          msclkid: payload.msclkid,
          ttclid: payload.ttclid,
          li_fat_id: payload.li_fat_id,
          twclid: payload.twclid,
          rdt_cid: payload.rdt_cid,
          sccid: payload.sccid,
          pin_aid: payload.pin_aid,
          epik: payload.epik,
          irclickid: payload.irclickid,
          cjevent: payload.cjevent,
        } as never,
      });
    }

    // 9. Atualiza claim com lead_id (auditoria + endpoint de duplicate
    // poder retornar o leadId do request original).
    await db
      .update(webhookIdempotency)
      .set({ leadId: newLead.id })
      .where(eq(webhookIdempotency.id, claimId));

    // 10. Duplicidades pendentes (revisão manual posterior).
    if (leadExistenteId && cpfClean) {
      await db.insert(duplicidadesPendentes).values({
        novoLeadId: newLead.id,
        leadExistenteId,
        cpf: cpfClean,
      });
    }

    // 11. Interação automática.
    await db.insert(interacoes).values({
      leadId: newLead.id,
      autorId: null,
      tipo: "evento_sistema",
      conteudo: `Lead criado via webhook (${routing.regraAplicada})${
        leadExistenteId ? " — possível duplicidade por CPF" : ""
      }`,
      metadata: {
        channel: classification.channel,
        source: classification.source,
        paid: classification.paid,
        classification_reason: classification.reason,
        classification_from_client: !classification.active_in_db ? false : undefined,
        // Mantém origem no metadata pra debug/auditoria.
        origem_legacy: payload.origem ?? null,
        duplicidade_lead_existente_id: leadExistenteId,
        routing,
      } as never,
    });
  } catch (err) {
    // Libera o claim pra retry imediato pelo caller (não fica travado 60s).
    await db
      .delete(webhookIdempotency)
      .where(eq(webhookIdempotency.id, claimId))
      .catch(() => {
        /* best-effort */
      });
    console.error("[webhook] criação do lead falhou, claim liberado:", err);
    return NextResponse.json(
      { error: "internal error", retryable: true },
      { status: 500 },
    );
  }

  // 12. Audit + email — TODOS via after() pra não bloquear resposta nem
  // serem cortados pelo serverless.
  const meta = extractRequestMeta(request);
  after(() =>
    logAction(
      null,
      null,
      "lead_criado_webhook",
      "lead",
      newLead.id,
      {
        channel: classification.channel,
        source: classification.source,
        paid: classification.paid,
        origem_legacy: payload.origem ?? null,
        duplicidade_lead_existente_id: leadExistenteId,
        routing,
      },
      meta,
    ),
  );

  // 13. E-mail "Novo lead" pros admins — disparado SEMPRE, independente do
  // horário comercial. Visão de pipeline em tempo real pro time gerencial,
  // sem depender de abrir o CRM. O consultor atribuído tem o e-mail dele
  // separado (bloco 14) com SLA. Admins de plantão fora do horário também
  // recebem o mesmo e-mail — usavam um template "alerta fora do horário"
  // antes, foi unificado pra reduzir ruído.
  after(async () => {
    const admins = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(sql`${usersTable.perfil} = 'admin' AND ${usersTable.ativo} = true`);
    const recipients = admins.map((a) => a.email).filter(Boolean);
    if (recipients.length > 0) {
      await sendNewLeadEmail(newLead, recipients);
    }
  });

  // 14. Email pro CONSULTOR atribuído (se routing rule designou um) —
  // independente do horário comercial. SLA de 30min começa agora.
  if (newLead.consultorId) {
    after(async () => {
      const [consultor] = await db
        .select({ email: usersTable.email, nome: usersTable.nome })
        .from(usersTable)
        .where(eq(usersTable.id, newLead.consultorId!))
        .limit(1);
      if (consultor?.email) {
        await sendLeadAssignedEmail(newLead, consultor.email, consultor.nome);
      }
    });
  }

  // 15. CAPI dispatch — Meta, TikTok, LinkedIn em paralelo. Plataformas não
  // configuradas retornam skipped graciosamente. Eventos de
  // qualificação/fechamento saem de capiOnStageChange (via onLeadStageChange,
  // chamado em toda transição).
  //
  // Este caminho é o do lead criado JÁ COMPLETO numa tacada (fluxo único do
  // /simulador). O fluxo em 2 etapas cria um parcial aqui e só vira conversão
  // no enriquecimento — o gate de `objetivoCredito` dentro de
  // capiOnLeadCreated cuida dos dois casos. O disparo em si fica mais abaixo,
  // depois do gate de score.

  // Lead novo já com e-mail (ex.: simulador Google Ads, fluxo único): convida
  // pro portal e devolve a URL pra página de sucesso do site.
  const portalUrlCreated = await invitePortal({
    leadId: newLead.id,
    nome: newLead.nome,
    email: newLead.email,
    notify: payload.notify,
  });

  const gateConversaoCriacao = payload.gate_conversao_score === true;
  const { token: agendaTokenCreated, score: scoreCriacao } =
    await aplicarGateDeScore(
      newLead,
      tokenAgendaSeElegivel(newLead, payload.notify, !!newLead.objetivoCredito),
      { aguardarScore: gateConversaoCriacao },
    );
  const conversaoLiberadaCriacao = await resolverGateDeConversao(
    newLead.id,
    scoreCriacao,
    gateConversaoCriacao,
  );

  // CAPI `Lead` — depois do gate de score pelo mesmo motivo do caminho de
  // enriquecimento: a CAPI dispara independente do browser, então antes do
  // gate ela furaria a supressão.
  after(() => capiOnLeadCreated(newLead, metaEventId, conversaoLiberadaCriacao));

  if (agendaTokenCreated) {
    // Marca a oferta da agenda — o cron do proativo espera 7 min a partir daqui.
    after(() =>
      db
        .update(leads)
        .set({ agendaOferecidaEm: new Date() })
        .where(eq(leads.id, newLead.id)),
    );
  }

  agendarProativoSeCompleto({
    leadId: newLead.id,
    nome: newLead.nome,
    whatsapp: newLead.whatsapp,
    notify: payload.notify,
    completo: !!newLead.objetivoCredito,
    qualifStatusAtual: newLead.qualifWhatsappStatus,
    deferirParaCron: !!agendaTokenCreated,
  });

  return NextResponse.json(
    {
      leadId: newLead.id,
      duplicate: false,
      possivelDuplicidadeCpf: leadExistenteId,
      portalUrl: portalUrlCreated,
      agendaToken: agendaTokenCreated,
      // Ver a nota na resposta do enriquecimento.
      ...(conversaoLiberadaCriacao !== undefined
        ? { conversaoLiberada: conversaoLiberadaCriacao }
        : {}),
    },
    { status: 201 },
  );
}
