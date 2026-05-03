import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { taskConfigPorStatus } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { patchTaskConfigSchema } from "@/lib/validators/task-config";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(taskConfigPorStatus)
    .where(eq(taskConfigPorStatus.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = patchTaskConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.ativo !== undefined) updates.ativo = data.ativo;
  if (data.titulo !== undefined) updates.titulo = data.titulo;
  if (data.descricao !== undefined) updates.descricao = data.descricao;
  if (data.frequenciaDias !== undefined)
    updates.frequenciaDias = data.frequenciaDias;

  const [updated] = await db
    .update(taskConfigPorStatus)
    .set(updates)
    .where(eq(taskConfigPorStatus.id, id))
    .returning();

  after(() =>
    logAction(
    null,
    user.id,
    "task_config_editado",
    "task_config_por_status",
    id,
    {
      statusKey: existing.statusKey,
      changes: Object.keys(updates).filter((k) => k !== "updatedAt"),
    },
    extractRequestMeta(request),
  )
  );

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(taskConfigPorStatus)
    .where(eq(taskConfigPorStatus.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.delete(taskConfigPorStatus).where(eq(taskConfigPorStatus.id, id));

  after(() =>
    logAction(
    null,
    user.id,
    "task_config_excluido",
    "task_config_por_status",
    id,
    { statusKey: existing.statusKey },
    extractRequestMeta(request),
  )
  );

  return NextResponse.json({ ok: true });
}
