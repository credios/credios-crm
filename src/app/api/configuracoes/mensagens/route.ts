import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { mensagensTemplate } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { upsertTemplateSchema } from "@/lib/validators/template";

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(mensagensTemplate)
    .orderBy(mensagensTemplate.ordem, mensagensTemplate.nome);

  return NextResponse.json({ data: rows });
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

  const parsed = upsertTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Próxima ordem = max + 1.
  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${mensagensTemplate.ordem}), 0)::int` })
    .from(mensagensTemplate);
  const novaOrdem = (maxRow?.max ?? 0) + 1;

  const [created] = await db
    .insert(mensagensTemplate)
    .values({
      nome: data.nome,
      ordem: novaOrdem,
      statusAplicavel: data.statusAplicavel,
      conteudo: data.conteudo,
      ativa: data.ativa,
    })
    .returning();

  void logAction(
    null,
    user.id,
    "template_criado",
    "mensagem_template",
    created.id,
    { nome: data.nome },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: created }, { status: 201 });
}
