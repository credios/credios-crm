import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { regrasRoteamento, users as usersTable } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { upsertRuleSchema } from "@/lib/validators/rule";

async function listUsuariosAtribuiveis() {
  return await db
    .select({
      id: usersTable.id,
      nome: usersTable.nome,
      email: usersTable.email,
      perfil: usersTable.perfil,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.ativo, true),
        inArray(usersTable.perfil, ["admin", "gerente", "consultor"]),
      ),
    )
    .orderBy(usersTable.nome);
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [rules, usuarios] = await Promise.all([
    db
      .select()
      .from(regrasRoteamento)
      .orderBy(desc(regrasRoteamento.prioridade), regrasRoteamento.nome),
    listUsuariosAtribuiveis(),
  ]);

  return NextResponse.json({ data: rules, usuarios });
}

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

  const parsed = upsertRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Nova regra entra com prioridade = max + 10 pra ficar no topo natural.
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${regrasRoteamento.prioridade}), 0)::int` })
    .from(regrasRoteamento);
  const novaPrioridade = (maxRow?.max ?? 0) + 10;

  const [created] = await db
    .insert(regrasRoteamento)
    .values({
      nome: data.nome,
      ativa: data.ativa,
      prioridade: novaPrioridade,
      condicoes: data.condicoes as never,
      acao: data.acao,
      parametros: (data.parametros ?? null) as never,
    })
    .returning();

  void logAction(
    null,
    user.id,
    "regra_criada",
    "regra_roteamento",
    created.id,
    { nome: data.nome, acao: data.acao },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: created }, { status: 201 });
}
