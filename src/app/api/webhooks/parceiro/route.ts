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
//   2. PORTAL (parceiros.credios.com.br): evento `partner.activated` quando
//      o parceiro ASSINA o contrato → marca o parceiro do CRM como `ativo`
//      (match por crm_parceiro_ref ou portal_partner_id).

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

const activatedSchema = z.object({
  event: z.literal("partner.activated"),
  portal_partner_id: z.string().min(1),
  crm_parceiro_ref: z.string().uuid().optional().nullable(),
  legal_name: z.string().optional().nullable(),
});

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

  // ── Evento do portal: parceiro assinou o contrato ──────────────────────
  const asActivated = activatedSchema.safeParse(raw);
  if (asActivated.success) {
    const ev = asActivated.data;
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
      // Parceiro criado direto no portal, sem passar pelo pipeline do CRM —
      // cria o registro já ativo pra visão de canal ficar completa.
      const [criado] = await db
        .insert(parceiros)
        .values({
          nome: ev.legal_name ?? "Parceiro do portal",
          status: "ativo",
          origem: "outro",
          portalPartnerId: ev.portal_partner_id,
          ativoEm: new Date(),
        })
        .returning({ id: parceiros.id });
      after(async () => {
        await db.insert(parceiroInteracoes).values({
          parceiroId: criado!.id,
          tipo: "evento_sistema",
          conteudo: "Parceria assinada no portal (registro criado pelo evento de ativação).",
          metadata: { kind: "partner_activated", portalPartnerId: ev.portal_partner_id },
        });
      });
      return NextResponse.json({ ok: true, created: true });
    }
    if (match.status !== "ativo") {
      await db
        .update(parceiros)
        .set({
          status: "ativo",
          ativoEm: new Date(),
          portalPartnerId: ev.portal_partner_id,
          updatedAt: new Date(),
        })
        .where(eq(parceiros.id, match.id));
      after(async () => {
        await db.insert(parceiroInteracoes).values({
          parceiroId: match.id,
          tipo: "mudanca_status",
          conteudo: "Contrato assinado no portal — parceria ATIVA. 🎉",
          metadata: {
            kind: "partner_activated",
            de: match.status,
            para: "ativo",
            portalPartnerId: ev.portal_partner_id,
          },
        });
      });
    }
    return NextResponse.json({ ok: true });
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
