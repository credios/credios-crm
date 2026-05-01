import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { regrasRoteamento } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { upsertRuleSchema } from "@/lib/validators/rule";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(regrasRoteamento)
    .where(eq(regrasRoteamento.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // PATCH aqui é replace completo (UI sempre envia regra inteira).
  const parsed = upsertRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const [updated] = await db
    .update(regrasRoteamento)
    .set({
      nome: data.nome,
      ativa: data.ativa,
      condicoes: data.condicoes as never,
      acao: data.acao,
      parametros: (data.parametros ?? null) as never,
    })
    .where(eq(regrasRoteamento.id, id))
    .returning();

  void logAction(
    null,
    user.id,
    "regra_editada",
    "regra_roteamento",
    id,
    { nome: data.nome, acao: data.acao },
    extractRequestMeta(request),
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
    .from(regrasRoteamento)
    .where(eq(regrasRoteamento.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.delete(regrasRoteamento).where(eq(regrasRoteamento.id, id));

  void logAction(
    null,
    user.id,
    "regra_excluida",
    "regra_roteamento",
    id,
    { nome: existing.nome },
    extractRequestMeta(request),
  );

  return NextResponse.json({ ok: true });
}
