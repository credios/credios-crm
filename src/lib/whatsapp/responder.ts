import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { interacoes, leads } from "../../../db/schema";
import { db } from "@/lib/db";
import {
  conversarComHeloisa,
  type HeloisaTurn,
  type Mensagem,
} from "@/lib/whatsapp/heloisa";
import { isSystemTerminal } from "@/lib/status/canonical";
import { generatePortalToken, portalUrl } from "@/lib/portal/token";
import {
  horarioEstaLivre,
  horariosDisponiveis,
  type Slot,
} from "@/lib/calendar/disponibilidade";
import { agendarReuniao } from "@/lib/sdr/agendar";
import { avaliarQualificacao } from "@/lib/sdr/qualificacao";
import {
  consultorDoLead,
  escolherConsultor,
  montarFatos,
  msgConfirmacao,
  msgManual,
  msgOfertaHorarios,
  msgReoferta,
  sdrAtivo,
} from "@/lib/sdr/fluxo";

const SIMULADOR_URL = "https://credios.com.br/simulador";

/**
 * Acha o lead pelo telefone (últimos 8 dígitos). Com vários leads no mesmo
 * número, prefere o ativo (não-terminal) mais recente; senão o mais recente.
 */
async function acharLead(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const last8 = digits.slice(-8);
  if (last8.length < 8) return null;
  const rows = await db
    .select()
    .from(leads)
    .where(sql`regexp_replace(${leads.whatsapp}, '\\D', '', 'g') LIKE ${"%" + last8}`)
    .orderBy(desc(leads.createdAt));
  if (rows.length === 0) return null;
  return rows.find((l) => !isSystemTerminal(l.status)) ?? rows[0];
}

type Lead = NonNullable<Awaited<ReturnType<typeof acharLead>>>;

function primeiroNome(lead: Lead): string {
  return lead.nome ? lead.nome.split(/\s+/)[0] : "";
}

/** Lead não encontrado → convida a simular e deixa claro que não localizou. */
function msgNaoIdentificado(): string {
  return [
    "Oi! Sou a Heloísa, da Credios 👋",
    "Não localizei um cadastro seu por aqui. Pra começar, é só fazer a sua simulação (rápida e gratuita):",
    SIMULADOR_URL,
    "Assim que você preencher, um consultor já entra em contato 🙂",
  ].join("\n\n");
}

/** Lead desqualificado → recusa educada. */
function msgDesqualificado(lead: Lead): string {
  const nome = primeiroNome(lead);
  return [
    `Oi${nome ? `, ${nome}` : ""}! Sou a Heloísa, da Credios 👋`,
    "Obrigada pelo seu contato e interesse no crédito com garantia de imóvel.",
    "Neste momento, não conseguimos seguir com a sua solicitação. Se algo mudar, a gente te avisa. Um abraço!",
  ].join("\n\n");
}

/** Fallback do lead ativo quando a Heloísa (IA) não responde. */
function msgFallbackAtivo(lead: Lead): string {
  const nome = primeiroNome(lead);
  return [
    `Oi${nome ? `, ${nome}` : ""}! Aqui é a Heloísa, da Credios 🙂`,
    "Sua proposta de crédito com garantia de imóvel já está em análise. Um consultor entra em contato com você em breve.",
  ].join("\n\n");
}

/** Reconstrói o histórico da conversa (últimas 30 trocas) pra contexto da IA. */
async function carregarHistorico(leadId: string): Promise<Mensagem[]> {
  const rows = await db
    .select({ tipo: interacoes.tipo, conteudo: interacoes.conteudo })
    .from(interacoes)
    .where(
      and(
        eq(interacoes.leadId, leadId),
        inArray(interacoes.tipo, ["whatsapp_recebido", "whatsapp_enviado"]),
      ),
    )
    .orderBy(desc(interacoes.criadoEm))
    .limit(30);
  return rows.reverse().map((r) => ({
    role: r.tipo === "whatsapp_recebido" ? ("user" as const) : ("assistant" as const),
    content: r.conteudo ?? "",
  }));
}

/**
 * Grava os campos de qualificação que a Heloísa descobriu. Com `gerirStatus`
 * (padrão), também cuida do status (em_andamento/concluida) — comportamento de
 * hoje. No fluxo SDR, o status é controlado pela máquina de estados (fluxoSdr),
 * então passamos `gerirStatus = false` pra não atropelar a transição.
 */
async function persistirQualificacao(
  leadId: string,
  turn: HeloisaTurn,
  gerirStatus = true,
): Promise<void> {
  const q = turn.qualificacao;
  const set: Partial<typeof leads.$inferInsert> = {};
  if (q.objetivo) set.qualifObjetivo = q.objetivo;
  if (q.titularidade) set.qualifTitularidade = q.titularidade;
  if (q.tem_imovel_garantia) set.qualifTemImovelGarantia = q.tem_imovel_garantia;
  if (q.imovel_regularizado) set.qualifImovelRegularizado = q.imovel_regularizado;
  if (q.pendencia_juridica) set.qualifPendenciaJuridica = q.pendencia_juridica;
  if (q.pendencia_bloqueante) set.qualifPendenciaBloqueante = q.pendencia_bloqueante;
  if (q.urgencia) set.qualifUrgencia = q.urgencia;
  if (gerirStatus) {
    set.qualifWhatsappStatus = turn.encerrar ? "concluida" : "em_andamento";
    if (turn.encerrar) set.qualifWhatsappEm = new Date();
  }
  // No fluxo SDR (gerirStatus=false) um turno pode não trazer nenhum campo novo
  // (ex.: a saudação inicial). `db.update().set({})` LANÇA no Drizzle ("No values
  // to set") — então, sem nada a gravar, não toca no banco. (Era a causa do bot
  // cair no fallback a cada mensagem com o SDR ligado.)
  if (Object.keys(set).length === 0) return;
  await db.update(leads).set(set).where(eq(leads.id, leadId));
}

/**
 * Anexa o link do portal de documentos à mensagem de encerramento da Heloísa.
 * Gera um token fresco (o raw só existe na hora) e devolve a URL pública. Reforça
 * o benefício (acelera análise/aprovação). Se NEXT_PUBLIC_APP_URL não estiver
 * setado, devolve a resposta sem link (não quebra o encerramento).
 */
async function anexarLinkDocumentos(leadId: string, resposta: string): Promise<string> {
  try {
    const { token } = await generatePortalToken(leadId);
    const url = portalUrl(token);
    if (!url.startsWith("http")) {
      // Sem NEXT_PUBLIC_APP_URL no build → URL relativa. Não dropa o passo em
      // silêncio (era o bug do fecho sem link): garante a menção à documentação.
      console.error("[whatsapp] portalUrl sem http (NEXT_PUBLIC_APP_URL?) — fallback sem link");
      return `${resposta}\n\nO consultor vai te enviar o link para você adiantar a documentação e acelerar a análise.`;
    }
    return `${resposta}\n\n📄 Pra adiantar a análise e acelerar a aprovação, deixe seus documentos prontos por aqui:\n${url}`;
  } catch (e) {
    console.error("[whatsapp] link de documentos falhou:", e);
    return resposta;
  }
}

/** Gera um token fresco e devolve a URL pública do portal de documentos do lead. */
async function gerarPortalUrl(leadId: string): Promise<string> {
  const { token } = await generatePortalToken(leadId);
  return portalUrl(token);
}

/** Marca a qualificação como concluída (encerra a conversa do SDR). */
async function concluirQualif(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({ qualifWhatsappStatus: "concluida", qualifWhatsappEm: new Date() })
    .where(eq(leads.id, leadId));
}

/**
 * Máquina de estados do SDR (só roda atrás do flag `sdrAtivo`). A cada turno:
 *  - fase "agendando" + cliente confirmou um horário → cria a reunião + link docs;
 *  - qualificação completa + QUALIFICADO → atribui consultor por valor e oferta horários;
 *  - qualificação completa + reprovado (ou qualificado sem agenda) → fila MANUAL + link docs;
 *  - ainda faltam dados → segue a conversa normal da Heloísa.
 * "Não qualificado" cai no fluxo manual de sempre — NUNCA vira "desqualificado".
 */
async function fluxoSdr(lead: Lead, turn: HeloisaTurn): Promise<string> {
  const nome = primeiroNome(lead);
  const fase = lead.qualifWhatsappStatus;

  // ── Fase de agendamento: o cliente confirmou um horário? ──
  if (fase === "agendando") {
    const consultor = lead.consultorId ? await consultorDoLead(lead.consultorId) : null;
    if (consultor && turn.agendar?.inicio) {
      const chk = await horarioEstaLivre(consultor.email, turn.agendar.inicio);
      if (chk.ok) {
        try {
          const ag = await agendarReuniao({
            leadId: lead.id,
            leadNome: lead.nome ?? "",
            consultorId: consultor.id,
            consultorEmail: consultor.email,
            clienteEmail: lead.email,
            inicioISO: turn.agendar.inicio,
            fimISO: chk.fimISO,
          });
          await concluirQualif(lead.id);
          return msgConfirmacao(ag.rotulo, ag.meetLink, await gerarPortalUrl(lead.id));
        } catch (e) {
          console.error("[sdr] agendarReuniao falhou — reoferta:", e);
        }
      }
      // horário indisponível (ou erro ao criar) → reoferta horários
      return msgReoferta(await horariosDisponiveis(consultor.email));
    }
    // ainda negociando horário, sem confirmação → segue a resposta da IA
    return turn.resposta;
  }

  // ── Ainda faltam dados pra decidir → conversa segue normalmente ──
  const { qualificado, faltando } = avaliarQualificacao(montarFatos(lead, turn.qualificacao));
  if (faltando.length > 0) return turn.resposta;

  // ── Qualificado → roteia por valor e oferta horários ──
  if (qualificado) {
    const consultor = await escolherConsultor(lead.valorCreditoCentavos);
    if (consultor) {
      const slots = await horariosDisponiveis(consultor.email);
      if (slots.length) {
        await db
          .update(leads)
          .set({
            consultorId: consultor.id,
            atribuidoEm: new Date(),
            qualifWhatsappStatus: "agendando",
          })
          .where(eq(leads.id, lead.id));
        await db.insert(interacoes).values({
          leadId: lead.id,
          autorId: null,
          tipo: "mudanca_atribuicao",
          conteudo: `Atribuído a ${consultor.nome} pela Heloísa (lead qualificado).`,
          metadata: {
            canal: "whatsapp_ia",
            consultorId: consultor.id,
            automatico: true,
          } as never,
        });
        return msgOfertaHorarios(nome, slots);
      }
    }
    console.warn("[sdr] qualificado mas sem consultor/horário disponível → manual");
  }

  // ── Reprovado (ou qualificado sem agenda) → fila MANUAL + link de documentos ──
  await concluirQualif(lead.id);
  return msgManual(nome, await gerarPortalUrl(lead.id));
}

/** Detecta o botão "Agora não" do template proativo (opt-out). */
function ehOptOut(texto: string): boolean {
  const t = texto.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return t === "agora nao";
}

/** Conta as mensagens que o cliente mandou DEPOIS de uma data (pós-conclusão). */
async function contarRecebidasApos(leadId: string, desde: Date): Promise<number> {
  const rows = await db
    .select({ id: interacoes.id })
    .from(interacoes)
    .where(
      and(
        eq(interacoes.leadId, leadId),
        eq(interacoes.tipo, "whatsapp_recebido"),
        gt(interacoes.criadoEm, desde),
      ),
    );
  return rows.length;
}

/** Já enviamos a recusa educada a este lead desqualificado? (evita repetir). */
async function jaAvisouDesqualificado(leadId: string): Promise<boolean> {
  const rows = await db
    .select({ id: interacoes.id })
    .from(interacoes)
    .where(
      and(
        eq(interacoes.leadId, leadId),
        eq(interacoes.tipo, "whatsapp_enviado"),
        sql`${interacoes.metadata} ->> 'desqualificado_aviso' = 'true'`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Decide a resposta pra uma mensagem do cliente e registra na timeline do lead.
 * Canal-agnóstico: hoje usado pelo webhook do WhatsApp (Meta Cloud API). Roteia:
 * não-identificado → simulador; desqualificado → recusa; ativo → Heloísa (IA).
 * Quando a qualificação já foi concluída, responde a no máx. 3 mensagens com um
 * fecho breve e depois SILENCIA (retorna null = não envia nada). Sem corte de 80.
 */
export async function responderMensagem(
  phone: string,
  mensagem: string,
  opts?: { eraAudio?: boolean },
): Promise<string | null> {
  const lead = await acharLead(phone);
  console.log(
    "[whatsapp] lead:",
    lead
      ? `${lead.id} (${lead.nome}) status=${lead.status} qualif=${lead.qualifWhatsappStatus}`
      : "(não encontrado)",
  );

  let resposta: string | null;
  let respostaTag: Record<string, unknown> | null = null; // metadata extra do enviado
  if (!lead) {
    resposta = msgNaoIdentificado();
  } else if (lead.status === "desqualificado") {
    // Desqualificado: avisa UMA vez (educado) e depois SILENCIA — sem repetir a
    // recusa a cada mensagem nem gerar custo à toa. (É estática, não usa a IA.)
    if (await jaAvisouDesqualificado(lead.id)) {
      resposta = null;
      console.log("[whatsapp] desqualificado já avisado → SILÊNCIO");
    } else {
      resposta = msgDesqualificado(lead);
      respostaTag = { desqualificado_aviso: true };
    }
  } else if (lead.qualifWhatsappStatus === "concluida") {
    // Qualificação encerrada: fecho breve por até 3 mensagens; depois, silêncio.
    const pos = lead.qualifWhatsappEm
      ? await contarRecebidasApos(lead.id, lead.qualifWhatsappEm)
      : 99;
    resposta = pos >= 3 ? null : "O consultor já vai entrar em contato com você 🙂";
    console.log("[whatsapp] pós-conclusão:", pos, resposta ? "(fecho)" : "(SILÊNCIO)");
  } else if (ehOptOut(mensagem)) {
    // Botão "Agora não" do template proativo → encerra educadamente; sem mais proativo.
    resposta =
      "Sem problema! 🙂 Obrigada pelo seu contato. Não vou te enviar mais mensagens por aqui — quando quiser retomar a sua proposta de crédito com garantia de imóvel, é só me chamar. Um abraço!";
    await db
      .update(leads)
      .set({ qualifWhatsappStatus: "optout" })
      .where(eq(leads.id, lead.id));
    console.log("[whatsapp] opt-out (Agora não)");
  } else if (!mensagem.trim()) {
    // Áudio/imagem/sticker sem texto, ou transcrição do áudio falhou.
    resposta = opts?.eraAudio
      ? "Recebi seu áudio, mas não consegui escutar certinho por aqui 🙏 Pode me mandar por texto?"
      : "Pode me mandar por texto? Assim consigo te ajudar certinho 🙂";
  } else {
    try {
      const sdrOn = sdrAtivo(phone);

      // Na fase de agendamento (SDR), injeta os horários livres do consultor no
      // contexto da IA pra ela ofertar/negociar. Fora dela, sem horários.
      let slots: Slot[] | undefined;
      if (sdrOn && lead.qualifWhatsappStatus === "agendando" && lead.consultorId) {
        const c = await consultorDoLead(lead.consultorId);
        if (c) slots = await horariosDisponiveis(c.email);
      }

      const historico = await carregarHistorico(lead.id);
      const turn = await conversarComHeloisa(lead, historico, mensagem, { slots });
      // No SDR, quem controla o status é a máquina de estados (fluxoSdr).
      await persistirQualificacao(lead.id, turn, !sdrOn);

      if (sdrOn) {
        resposta = await fluxoSdr(lead, turn);
      } else {
        resposta = turn.resposta;
        // No encerramento, manda o link do portal de documentos (acelera a aprovação).
        if (turn.encerrar) resposta = await anexarLinkDocumentos(lead.id, resposta);
      }
      console.log(
        "[whatsapp] heloisa:",
        sdrOn ? "(sdr)" : turn.encerrar ? "ENCERROU" : "em andamento",
        "| qualif:",
        JSON.stringify(turn.qualificacao),
        turn.agendar ? `| agendar=${turn.agendar.inicio}` : "",
      );
    } catch (e) {
      console.error("[whatsapp] heloisa falhou — fallback:", e);
      resposta = msgFallbackAtivo(lead);
    }
  }

  // Timeline: entrada sempre; saída só se houve resposta (null = silêncio).
  if (lead) {
    // Registra a entrada: o texto, ou um marcador quando foi um áudio que não
    // deu pra transcrever (antes isso sumia da timeline — só aparecia a resposta).
    const conteudoRecebido = mensagem.trim()
      ? mensagem
      : opts?.eraAudio
        ? "🎤 (áudio recebido — não consegui transcrever)"
        : null;
    if (conteudoRecebido) {
      await db.insert(interacoes).values({
        leadId: lead.id,
        autorId: null,
        tipo: "whatsapp_recebido",
        conteudo: conteudoRecebido,
        metadata: {
          canal: "whatsapp_ia",
          audio_falhou: !mensagem.trim() && !!opts?.eraAudio,
        } as never,
      });
    }
    if (resposta) {
      await db.insert(interacoes).values({
        leadId: lead.id,
        autorId: null,
        tipo: "whatsapp_enviado",
        conteudo: resposta,
        metadata: { canal: "whatsapp_ia", automatico: true, ...(respostaTag ?? {}) } as never,
      });
    }
  }

  return resposta;
}

/**
 * Registra na timeline do lead que o Meta reportou FALHA DE ENTREGA de uma
 * mensagem (webhook de status `failed`). Antes, "enviado mas não entregue" era
 * invisível — o app só sabia do 200 do envio, nunca do resultado da entrega.
 * Correlaciona pelo telefone do destinatário (recipient_id do Meta).
 */
export async function registrarFalhaEntrega(
  phone: string,
  info: { codigo?: number; titulo?: string; detalhe?: string },
): Promise<void> {
  const motivo =
    [info.codigo, info.titulo].filter(Boolean).join(" — ") || "motivo não informado";
  const lead = await acharLead(phone);
  console.warn(
    `[whatsapp] entrega FALHOU p/ ${phone}: ${motivo}` +
      (lead ? ` (lead ${lead.id})` : " (lead não encontrado)"),
  );
  if (!lead) return;
  await db.insert(interacoes).values({
    leadId: lead.id,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: `⚠️ WhatsApp não entregue pelo Meta: ${motivo}${info.detalhe ? ` — ${info.detalhe}` : ""}`,
    metadata: { canal: "whatsapp_ia", status: "failed", codigo: info.codigo ?? null } as never,
  });
}

/**
 * Atualiza o status de ENTREGA (delivered/read/failed) de uma mensagem enviada,
 * casando pelo `wamid` que o Meta devolveu no envio. Retorna true se casou
 * alguma interação. É a base da visibilidade "enviado × entregue × lido × falhou".
 */
export async function registrarEntregaStatus(
  wamid: string,
  status: "delivered" | "read" | "failed",
  erro?: string,
): Promise<boolean> {
  const patch: Record<string, unknown> = { entrega: status };
  if (erro) patch.entrega_erro = erro;
  const rows = await db
    .update(interacoes)
    .set({
      metadata: sql`coalesce(${interacoes.metadata}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(sql`${interacoes.metadata} ->> 'wamid' = ${wamid}`)
    .returning({ id: interacoes.id });
  return rows.length > 0;
}

/**
 * No path REATIVO, o envio acontece no webhook DEPOIS de a interação ser criada,
 * então o wamid não está disponível na hora. Aqui guardamos o wamid na última
 * mensagem enviada ao lead (a que acabou de sair) pra rastrear a entrega dela.
 */
export async function marcarWamidUltimoEnviado(
  phone: string,
  wamid: string,
): Promise<void> {
  const lead = await acharLead(phone);
  if (!lead) return;
  const ult = await db
    .select({ id: interacoes.id })
    .from(interacoes)
    .where(
      and(
        eq(interacoes.leadId, lead.id),
        eq(interacoes.tipo, "whatsapp_enviado"),
        sql`${interacoes.metadata} ->> 'wamid' IS NULL`,
      ),
    )
    .orderBy(desc(interacoes.criadoEm))
    .limit(1);
  if (!ult.length) return;
  await db
    .update(interacoes)
    .set({
      metadata: sql`coalesce(${interacoes.metadata}, '{}'::jsonb) || ${JSON.stringify({ wamid })}::jsonb`,
    })
    .where(eq(interacoes.id, ult[0]!.id));
}
