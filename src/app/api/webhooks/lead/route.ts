import crypto from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  duplicidadesPendentes,
  interacoes,
  leads,
  users as usersTable,
  webhookIdempotency,
} from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { db } from "@/lib/db";
import { foraHorarioComercial } from "@/lib/horario-comercial";
import {
  sendLeadAssignedEmail,
  sendNewLeadAlert,
} from "@/lib/notifications/email";
import { contextFromWebhook } from "@/lib/routing/context";
import { realRoutingDeps } from "@/lib/routing/db-deps";
import { aplicarRoteamento } from "@/lib/routing/engine";
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

export async function POST(request: NextRequest) {
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

    // 8. Insere lead.
    const inserted = await db
      .insert(leads)
      .values({
      nome: payload.nome,
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
      situacaoImovel: emptyToNull(payload.situacao_imovel ?? null),
      tipoPessoa: emptyToNull(payload.tipo_pessoa ?? null),
      valorImovelCentavos: reaisParaCentavos(payload.valor_imovel),
      valorCreditoCentavos: reaisParaCentavos(payload.valor_credito),
      consultorId: routing.consultorId,
      atribuidoEm: routing.consultorId ? new Date() : null,
      origem: emptyToNull(payload.origem ?? null) ?? "Webhook",
      utmSource: emptyToNull(payload.utm_source ?? null),
      utmMedium: emptyToNull(payload.utm_medium ?? null),
      utmCampaign: emptyToNull(payload.utm_campaign ?? null),
      utmTerm: emptyToNull(payload.utm_term ?? null),
      utmContent: emptyToNull(payload.utm_content ?? null),
      gclid: emptyToNull(payload.gclid ?? null),
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
        origem: payload.origem ?? "Webhook",
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
        origem: payload.origem ?? "Webhook",
        duplicidade_lead_existente_id: leadExistenteId,
        routing,
      },
      meta,
    ),
  );

  // 13. Email para admins se fora do horário comercial.
  if (foraHorarioComercial()) {
    after(async () => {
      const admins = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(sql`${usersTable.perfil} = 'admin' AND ${usersTable.ativo} = true`);
      const recipients = admins.map((a) => a.email).filter(Boolean);
      if (recipients.length > 0) {
        await sendNewLeadAlert(newLead, recipients);
      }
    });
  }

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

  return NextResponse.json(
    { leadId: newLead.id, duplicate: false, possivelDuplicidadeCpf: leadExistenteId },
    { status: 201 },
  );
}
