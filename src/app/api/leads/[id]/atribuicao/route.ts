import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import {
  interacoes,
  leads as leadsTable,
  users as usersTable,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { reassignSchema } from "@/lib/validators/lead";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!checkPermission(user, "lead.assign")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = reassignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { consultorId } = parsed.data;

  if (consultorId) {
    const [target] = await db
      .select({ id: usersTable.id, ativo: usersTable.ativo })
      .from(usersTable)
      .where(eq(usersTable.id, consultorId))
      .limit(1);
    if (!target || !target.ativo) {
      return NextResponse.json(
        { error: "consultor inválido ou inativo" },
        { status: 400 },
      );
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(leadsTable)
    .set({
      consultorId,
      atribuidoEm: consultorId ? now : null,
      atribuidoPor: consultorId ? user.id : null,
    })
    .where(eq(leadsTable.id, id))
    .returning();

  await db.insert(interacoes).values({
    leadId: id,
    autorId: user.id,
    tipo: "mudanca_atribuicao",
    conteudo: consultorId
      ? `Lead atribuído (de ${existing.consultorId ?? "pool"} para ${consultorId})`
      : `Lead movido para pool não-atribuído`,
    metadata: { de: existing.consultorId, para: consultorId } as never,
  });

  void logAction(
    null,
    user.id,
    "lead_atribuido",
    "lead",
    id,
    { de: existing.consultorId, para: consultorId },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: updated });
}
