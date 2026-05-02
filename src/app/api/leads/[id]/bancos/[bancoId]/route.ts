import { and, eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { leadBancos, leads as leadsTable } from "../../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ensureBancoInteracao } from "@/lib/tasks/service";
import { updateLeadBancoSchema } from "@/lib/validators/task";

type Ctx = { params: Promise<{ id: string; bancoId: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, bancoId } = await params;
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

  const parsed = updateLeadBancoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { atualizadoEm: new Date() };
  if (parsed.data.status) updates.status = parsed.data.status;
  if ("observacoes" in parsed.data) updates.observacoes = parsed.data.observacoes ?? null;

  const [updated] = await db
    .update(leadBancos)
    .set(updates)
    .where(and(eq(leadBancos.id, bancoId), eq(leadBancos.leadId, id)))
    .returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await ensureBancoInteracao({
    leadId: id,
    userId: user.id,
    banco: updated.banco,
    status: updated.status,
    observacoes: updated.observacoes,
  });

  after(() =>
    logAction(
      null,
      user.id,
      "lead_banco_atualizado",
      "lead",
      id,
      { banco: updated.banco, status: updated.status },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ data: updated });
}
