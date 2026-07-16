import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import {
  parceiroInteracoes,
  parceiros,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/parceiros/[id]/convidar-portal — HANDOFF pro portal de parceiros.
// Cria o Partner lá (INVITED) via webhook autenticado, dispara o convite com
// o contrato e vincula os dois registros. Admin/gerente only.
//
// Env: PORTAL_WEBHOOK_URL (deriva o origin) + PORTAL_WEBHOOK_SECRET — os
// mesmos do notifyPartnerPortal.

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminOrGerente(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const portalUrl = process.env.PORTAL_WEBHOOK_URL;
  const secret = process.env.PORTAL_WEBHOOK_SECRET;
  if (!portalUrl || !secret) {
    return NextResponse.json(
      { error: "Integração com o portal não configurada (envs ausentes)." },
      { status: 500 },
    );
  }

  const { id } = await params;
  const [p] = await db.select().from(parceiros).where(eq(parceiros.id, id)).limit(1);
  if (!p) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  if (p.portalPartnerId) {
    return NextResponse.json({ ok: true, jaVinculado: true });
  }
  if (!p.email || !p.cpfCnpj) {
    return NextResponse.json(
      { error: "Preencha e-mail e CPF/CNPJ antes de convidar." },
      { status: 400 },
    );
  }
  if (!p.whatsapp) {
    return NextResponse.json(
      { error: "Preencha o WhatsApp antes de convidar (o portal exige telefone)." },
      { status: 400 },
    );
  }

  const origin = new URL(portalUrl).origin;
  let res: Response;
  try {
    res = await fetch(`${origin}/api/webhooks/crm-partner`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-portal-secret": secret,
      },
      body: JSON.stringify({
        event: "partner.create_invite",
        legalName: p.nome,
        document: p.cpfCnpj,
        email: p.email,
        phone: p.whatsapp,
        archetype: p.segmento ?? "outro",
        city: p.cidade,
        state: p.estado,
        notes: p.notas,
        crmPartnerRef: p.id,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error("[parceiros/handoff] portal inacessível:", err);
    return NextResponse.json(
      { error: "Portal não respondeu. Tente de novo em instantes." },
      { status: 502 },
    );
  }

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    partnerId?: string;
    error?: string;
  };
  if (!res.ok || !body.partnerId) {
    return NextResponse.json(
      { error: body.error ?? `Portal recusou (HTTP ${res.status}).` },
      { status: 422 },
    );
  }

  const agora = new Date();
  await db
    .update(parceiros)
    .set({
      status: "convidado_portal",
      portalPartnerId: body.partnerId,
      convidadoPortalEm: agora,
      updatedAt: agora,
    })
    .where(eq(parceiros.id, id));
  await db.insert(parceiroInteracoes).values({
    parceiroId: id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo:
      "Convite enviado pelo portal: parceiro criado lá e e-mail com o contrato disparado.",
    metadata: { kind: "handoff_portal", portalPartnerId: body.partnerId },
  });

  const meta = extractRequestMeta(request);
  void logAction(null, user.id, "parceiro_convidado_portal", "parceiro", id, {
    portalPartnerId: body.partnerId,
  }, meta);

  return NextResponse.json({ ok: true, portalPartnerId: body.partnerId });
}
