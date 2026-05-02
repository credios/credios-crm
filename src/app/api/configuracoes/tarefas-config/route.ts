import { asc } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { taskConfigPorStatus } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { upsertTaskConfigSchema } from "@/lib/validators/task-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data = await db
    .select()
    .from(taskConfigPorStatus)
    .orderBy(asc(taskConfigPorStatus.statusKey));
  return NextResponse.json({ data });
}

/**
 * POST — upsert por statusKey. Cria se não existe, sobrescreve campos
 * editáveis se existe. UI usa isso quando admin "ativa tarefa pra status X".
 */
export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = upsertTaskConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const [row] = await db
    .insert(taskConfigPorStatus)
    .values({
      statusKey: data.statusKey,
      ativo: data.ativo,
      titulo: data.titulo,
      descricao: data.descricao ?? null,
      frequenciaDias: data.frequenciaDias,
    })
    .onConflictDoUpdate({
      target: taskConfigPorStatus.statusKey,
      set: {
        ativo: data.ativo,
        titulo: data.titulo,
        descricao: data.descricao ?? null,
        frequenciaDias: data.frequenciaDias,
        updatedAt: new Date(),
      },
    })
    .returning();

  void logAction(
    null,
    user.id,
    "task_config_upsert",
    "task_config_por_status",
    row.id,
    { statusKey: data.statusKey, ativo: data.ativo, frequencia: data.frequenciaDias },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: row });
}
