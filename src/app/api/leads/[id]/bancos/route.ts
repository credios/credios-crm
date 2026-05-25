import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { leadBancos, leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ensureBancoInteracao, listLeadBancos } from "@/lib/leads/bancos";
import { createLeadBancoSchema } from "@/lib/validators/banco";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil === "marketing") return NextResponse.json({ data: [] });

  const { id } = await params;
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!checkPermission(user, "lead.read", { type: "lead", consultorId: lead.consultorId })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data: await listLeadBancos(id) });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (
    !checkPermission(user, "lead_bank.manage", {
      type: "lead",
      consultorId: lead.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = createLeadBancoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(leadBancos)
    .values({
      leadId: id,
      banco: parsed.data.banco,
      status: parsed.data.status,
      criadoPor: user.id,
      observacoes: parsed.data.observacoes ?? null,
    })
    .onConflictDoUpdate({
      target: [leadBancos.leadId, leadBancos.banco],
      set: {
        status: parsed.data.status,
        observacoes: parsed.data.observacoes ?? null,
        atualizadoEm: new Date(),
      },
    })
    .returning();

  await ensureBancoInteracao({
    leadId: id,
    userId: user.id,
    banco: parsed.data.banco,
    status: parsed.data.status,
    observacoes: parsed.data.observacoes ?? null,
  });

  after(() =>
    logAction(
      null,
      user.id,
      "lead_banco_atualizado",
      "lead",
      id,
      { banco: parsed.data.banco, status: parsed.data.status },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ data: created }, { status: 201 });
}
