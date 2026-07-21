import crypto from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  parceiroInteracoes,
  parceiros,
  users as usersTable,
  webhookIdempotency,
} from "../../../../../db/schema";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  sendParceiroAutoReplyEmail,
  sendParceiroCandidatoEmail,
} from "@/lib/parceiros/email";
import { PARCEIRO_SEGMENTOS } from "@/lib/parceiros/constants";

// Webhook do módulo de Parceiros. Dois emissores, mesmo secret do ecossistema
// (x-webhook-secret = WEBHOOK_SECRET, o mesmo que o site e o portal já usam
// pra criar leads de cliente):
//
//   1. SITE (credios.com.br/parceiros): candidato a parceiro preencheu o
//      form → cria registro em `parceiros` (pool sem dono — o admin faz a
//      triagem antes de atribuir), auto-reply pro candidato, e-mail pro admin.
//
//   2. PORTAL (parceiros.credios.com.br): evento `partner.synced` (e o legado
//      `partner.activated`) — upsert por portal_partner_id, enriquece os dados
//      e mapeia o status do portal pro estágio do pipeline (INVITED/PENDING →
//      `convidado_portal`, ACTIVE → `ativo`). Só avança de estágio, nunca
//      regride o que o consultor curou.

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const candidatoSchema = z.object({
  event: z.literal("candidato").optional(),
  nome: z.string().min(2).max(160),
  whatsapp: z.string().min(8).max(32),
  email: z.string().email().max(160).optional().nullable(),
  segmento: z.enum(PARCEIRO_SEGMENTOS).optional().nullable(),
  cidade: z.string().max(120).optional().nullable(),
  estado: z.string().length(2).optional().nullable(),
  mensagem: z.string().max(4000).optional().nullable(),
  origem: z.enum(["site", "indicacao", "prospeccao", "evento", "outro"]).optional(),
});

// Sync de parceiro vindo do portal. `partner.synced` (novo, com dados
// completos) e `partner.activated` (legado, só legal_name) caem no mesmo
// handler. O portal manda o status atual; o CRM mapeia pro estágio do pipeline
// e faz upsert por portal_partner_id, preenchendo só os campos que estão vazios.
const syncedSchema = z.object({
  event: z.enum(["partner.synced", "partner.activated"]),
  portal_partner_id: z.string().min(1),
  crm_parceiro_ref: z.string().uuid().optional().nullable(),
  portal_status: z.string().optional().nullable(),
  legal_name: z.string().optional().nullable(), // legado (partner.activated)
  nome: z.string().optional().nullable(),
  empresa: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  documento: z.string().optional().nullable(),
  segmento: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
  taxa_comissao: z.number().optional().nullable(),
  gerente_nome: z.string().optional().nullable(),
  assinado_em: z.string().optional().nullable(),
});

// Estágios do pipeline em ordem — o sync só AVANÇA (nunca regride um parceiro
// que o consultor já moveu adiante). `perdido` é especial: só a ativação real
// o revive.
const STAGE_RANK: Record<string, number> = {
  novo: 0,
  em_contato: 1,
  reuniao: 2,
  proposta_enviada: 3,
  convidado_portal: 4,
  ativo: 5,
};

/** Status do portal → estágio-alvo no CRM (null = não mexe no estágio). */
function targetStage(portalStatus: string | null | undefined): "convidado_portal" | "ativo" | null {
  switch (portalStatus) {
    case "ACTIVE":
      return "ativo";
    case "INVITED":
    case "PENDING_CONTRACT":
      return "convidado_portal";
    default:
      return null; // SUSPENDED/INACTIVE/desconhecido: enriquece dados, não mexe no estágio
  }
}

function normalizaWhatsapp(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") ? `+${d}` : `+55${d}`;
}

async function adminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(sql`${usersTable.perfil} = 'admin' AND ${usersTable.ativo} = true`);
  return rows.map((r) => r.email);
}

export async function POST(request: NextRequest) {
  if (!rateLimit(`webhook-parceiro:${clientIp(request.headers)}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const secret = process.env.WEBHOOK_SECRET;
  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!secret || !timingSafeEquals(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  // ── Evento do portal: sync de parceiro (criado/convidado/assinado) ─────
  const asSynced = syncedSchema.safeParse(raw);
  if (asSynced.success) {
    const ev = asSynced.data;
    // partner.activated legado não manda portal_status → trata como ACTIVE.
    const portalStatus =
      ev.portal_status ?? (ev.event === "partner.activated" ? "ACTIVE" : null);
    const stage = targetStage(portalStatus);

    const email = ev.email?.trim().toLowerCase() || null;
    const whatsapp = ev.whatsapp ? normalizaWhatsapp(ev.whatsapp) : null;
    const documento = ev.documento?.replace(/\D/g, "") || null;
    const segmento =
      ev.segmento && (PARCEIRO_SEGMENTOS as readonly string[]).includes(ev.segmento)
        ? ev.segmento
        : null;
    const cidade = ev.cidade?.trim() || null;
    const estado = ev.estado?.trim().toUpperCase() || null;
    const empresa = ev.empresa?.trim() || null;
    const nome = ev.nome?.trim() || ev.legal_name?.trim() || "Parceiro do portal";
    const assinadoEm = ev.assinado_em ? new Date(ev.assinado_em) : new Date();
    // Extras sem coluna dedicada (auditável em raw_payload).
    const extras = {
      portal_sync: {
        portalStatus,
        taxa_comissao: ev.taxa_comissao ?? null,
        gerente_nome: ev.gerente_nome ?? null,
        at: new Date().toISOString(),
      },
    };

    const [match] = await db
      .select({ id: parceiros.id, status: parceiros.status })
      .from(parceiros)
      .where(
        ev.crm_parceiro_ref
          ? eq(parceiros.id, ev.crm_parceiro_ref)
          : eq(parceiros.portalPartnerId, ev.portal_partner_id),
      )
      .limit(1);

    if (!match) {
      // Parceiro sem registro no CRM (criado direto no portal). Cria já no
      // estágio-alvo (convidado_portal ou ativo) com os dados que vieram.
      const insertStatus = stage ?? "convidado_portal";
      const isAtivo = insertStatus === "ativo";
      const [criado] = await db
        .insert(parceiros)
        .values({
          nome,
          empresa,
          email,
          whatsapp,
          segmento,
          cidade,
          estado,
          cpfCnpj: documento,
          status: insertStatus,
          origem: "outro",
          portalPartnerId: ev.portal_partner_id,
          convidadoPortalEm: new Date(),
          ativoEm: isAtivo ? assinadoEm : null,
          rawPayload: extras,
        })
        .returning({ id: parceiros.id });
      after(async () => {
        await db.insert(parceiroInteracoes).values({
          parceiroId: criado!.id,
          tipo: isAtivo ? "mudanca_status" : "evento_sistema",
          conteudo: isAtivo
            ? "Contrato assinado no portal — parceria ATIVA. 🎉"
            : "Parceiro sincronizado do portal (convidado).",
          metadata: { kind: "partner_synced", portalStatus, portalPartnerId: ev.portal_partner_id },
        });
      });
      return NextResponse.json({ ok: true, created: true });
    }

    // Enriquecimento: preenche só os campos vazios (COALESCE) — nunca sobrescreve
    // o que o consultor já curou num parceiro de origem CRM.
    const set: Record<string, unknown> = {
      updatedAt: new Date(),
      portalPartnerId: sql`coalesce(${parceiros.portalPartnerId}, ${ev.portal_partner_id})`,
      email: sql`coalesce(${parceiros.email}, ${email})`,
      whatsapp: sql`coalesce(${parceiros.whatsapp}, ${whatsapp})`,
      cpfCnpj: sql`coalesce(${parceiros.cpfCnpj}, ${documento})`,
      segmento: sql`coalesce(${parceiros.segmento}, ${segmento})`,
      cidade: sql`coalesce(${parceiros.cidade}, ${cidade})`,
      estado: sql`coalesce(${parceiros.estado}, ${estado})`,
      empresa: sql`coalesce(${parceiros.empresa}, ${empresa})`,
      rawPayload: sql`coalesce(${parceiros.rawPayload}, '{}'::jsonb) || ${JSON.stringify(extras)}::jsonb`,
    };

    // Estágio: só avança (rank maior); ativo sempre vence, inclusive de perdido.
    const curRank = STAGE_RANK[match.status] ?? -1;
    const advancing =
      stage != null &&
      match.status !== stage &&
      (stage === "ativo"
        ? match.status !== "ativo"
        : match.status !== "perdido" && STAGE_RANK[stage] > curRank);
    if (advancing) {
      set.status = stage;
      if (stage === "convidado_portal")
        set.convidadoPortalEm = sql`coalesce(${parceiros.convidadoPortalEm}, now())`;
      if (stage === "ativo") set.ativoEm = sql`coalesce(${parceiros.ativoEm}, ${assinadoEm})`;
    }

    await db.update(parceiros).set(set).where(eq(parceiros.id, match.id));

    if (advancing) {
      const virouAtivo = stage === "ativo";
      after(async () => {
        await db.insert(parceiroInteracoes).values({
          parceiroId: match.id,
          tipo: "mudanca_status",
          conteudo: virouAtivo
            ? "Contrato assinado no portal — parceria ATIVA. 🎉"
            : "Parceiro convidado ao portal (sync).",
          metadata: {
            kind: "partner_synced",
            de: match.status,
            para: stage,
            portalPartnerId: ev.portal_partner_id,
          },
        });
      });
    }
    return NextResponse.json({ ok: true, updated: true });
  }

  // ── Candidato do site ───────────────────────────────────────────────────
  const parsed = candidatoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload inválido", detalhes: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Idempotência (retries do site): hash do payload, janela 10 min.
  const hash = crypto
    .createHash("sha256")
    .update("parceiro:" + JSON.stringify(data))
    .digest("hex");
  try {
    await db.insert(webhookIdempotency).values({ payloadHash: hash });
  } catch {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  const whatsapp = normalizaWhatsapp(data.whatsapp);
  if (!whatsapp) {
    return NextResponse.json({ error: "whatsapp inválido" }, { status: 400 });
  }

  const [criado] = await db
    .insert(parceiros)
    .values({
      nome: data.nome.trim(),
      email: data.email?.trim().toLowerCase() ?? null,
      whatsapp,
      segmento: data.segmento ?? null,
      cidade: data.cidade?.trim() ?? null,
      estado: data.estado?.toUpperCase() ?? null,
      mensagem: data.mensagem?.trim() ?? null,
      origem: data.origem ?? "site",
      rawPayload: raw,
      // consultorId fica NULL de propósito: triagem é do admin.
    })
    .returning({ id: parceiros.id });

  const id = criado!.id;
  after(async () => {
    try {
      await db.insert(parceiroInteracoes).values({
        parceiroId: id,
        tipo: "evento_sistema",
        conteudo: "Candidato chegou pela página de parceiros do site.",
        metadata: { kind: "candidato_site" },
      });
      const admins = await adminEmails();
      await sendParceiroCandidatoEmail(
        {
          id,
          nome: data.nome,
          email: data.email ?? null,
          whatsapp,
          segmento: data.segmento ?? null,
          cidade: data.cidade ?? null,
          estado: data.estado ?? null,
          mensagem: data.mensagem ?? null,
        },
        admins,
      );
      if (data.email) {
        await sendParceiroAutoReplyEmail({ nome: data.nome, email: data.email });
      }
    } catch (err) {
      console.error("[webhook/parceiro] pós-processamento falhou:", err);
    }
  });

  return NextResponse.json({ ok: true, parceiro_id: id }, { status: 201 });
}
