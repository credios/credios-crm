import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { users as usersTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { updateUserSchema } from "@/lib/validators/user";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;

  // Auto-proteção: admin não pode rebaixar/desativar a si mesmo (evita lockout).
  if (id === user.id) {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      body = {};
    }
    const b = body as { perfil?: string; ativo?: boolean };
    if (b.perfil && b.perfil !== "admin") {
      return NextResponse.json(
        { error: "Não pode mudar próprio perfil — peça pra outro admin" },
        { status: 400 },
      );
    }
    if (b.ativo === false) {
      return NextResponse.json(
        { error: "Não pode desativar a si mesmo" },
        { status: 400 },
      );
    }
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const updates: Record<string, unknown> = {};
  if (data.nome != null) updates.nome = data.nome;
  if (data.perfil != null) updates.perfil = data.perfil;
  if (data.ativo != null) updates.ativo = data.ativo;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  void logAction(
    null,
    user.id,
    "usuario_editado",
    "usuario",
    id,
    { fields: Object.keys(updates), antes: { nome: existing.nome, perfil: existing.perfil, ativo: existing.ativo }, depois: updates },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: updated });
}
