import { and, asc, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { cadenciaConfig, mensagensTemplate } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { CADENCIA_CACHE_TAG } from "@/lib/cadencia/config";
import { db } from "@/lib/db";
import { PRODUTOS_ATIVOS } from "@/lib/produtos";

// Config das cadências de follow-up — Admin edita dias/passos/templates/energia
// pela UI, sem deploy (/configuracoes/cadencias).

const passoSchema = z.object({
  titulo: z.string().min(1).max(120),
  deltaDias: z.number().int().min(0).max(60),
  tipo: z.enum(["mensagem", "ligacao", "decisao"]),
  templateId: z.string().uuid().nullable(),
  energia: z.string().max(160).nullable(),
});

const produtoSchema = z.enum(PRODUTOS_ATIVOS).default("CGI");

const putSchema = z.object({
  statusKey: z.string().min(1),
  produto: produtoSchema,
  ativa: z.boolean(),
  passos: z.array(passoSchema).min(1).max(12),
});

// GET ?produto=CGI|CONDOMINIO — cadências e templates DAQUELE produto.
export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const produto = produtoSchema.safeParse(request.nextUrl.searchParams.get("produto") ?? undefined);
  const p = produto.success ? produto.data : "CGI";
  const [cadencias, templates] = await Promise.all([
    db
      .select()
      .from(cadenciaConfig)
      .where(eq(cadenciaConfig.produto, p))
      .orderBy(asc(cadenciaConfig.statusKey)),
    db
      .select({ id: mensagensTemplate.id, nome: mensagensTemplate.nome })
      .from(mensagensTemplate)
      .where(and(eq(mensagensTemplate.ativa, true), eq(mensagensTemplate.produto, p)))
      .orderBy(asc(mensagensTemplate.nome)),
  ]);
  return NextResponse.json({ cadencias, templates });
}

// POST { produto } — cria as cadências do produto copiando a ESTRUTURA das de
// CGI (dias, tipos de passo, títulos). Nascem DESLIGADAS e sem template nos
// passos de mensagem: os textos de CGI não servem pra outro produto.
export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = z
    .object({ produto: z.enum(PRODUTOS_ATIVOS) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.produto === "CGI") {
    return NextResponse.json({ error: "produto inválido" }, { status: 400 });
  }
  const { produto } = parsed.data;
  const base = await db.select().from(cadenciaConfig).where(eq(cadenciaConfig.produto, "CGI"));
  let criadas = 0;
  for (const c of base) {
    const passos = (c.passos as Array<Record<string, unknown>>).map((x) => ({
      ...x,
      templateId: null,
    }));
    const r = await db
      .insert(cadenciaConfig)
      .values({ statusKey: c.statusKey, produto, passos: passos as never, ativa: false })
      .onConflictDoNothing()
      .returning({ id: cadenciaConfig.id });
    criadas += r.length;
  }
  revalidateTag(CADENCIA_CACHE_TAG, "max");
  void logAction(null, user.id, "cadencia_copiada", "cadencia_config", null, { produto, criadas },
    extractRequestMeta(request));
  return NextResponse.json({ ok: true, criadas });
}

export async function PUT(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { statusKey, produto, passos, ativa } = parsed.data;

  // O último passo deve ser a decisão (o coletor e a Mesa dependem disso);
  // passos de mensagem precisam de template.
  if (passos[passos.length - 1]!.tipo !== "decisao") {
    return NextResponse.json(
      { error: "o último passo precisa ser do tipo 'decisao'" },
      { status: 400 },
    );
  }
  // Cadência desligada pode ficar com passo sem template (rascunho, recém
  // copiada); pra LIGAR, todo passo de mensagem precisa de um.
  if (ativa && passos.some((p) => p.tipo === "mensagem" && !p.templateId)) {
    return NextResponse.json(
      { error: "pra ligar a cadência, todo passo de mensagem precisa de um template" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(cadenciaConfig)
    .set({ passos: passos as never, ativa, updatedAt: new Date() })
    .where(and(eq(cadenciaConfig.statusKey, statusKey), eq(cadenciaConfig.produto, produto)))
    .returning({ id: cadenciaConfig.id });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  revalidateTag(CADENCIA_CACHE_TAG, "max");
  void logAction(
    null,
    user.id,
    "cadencia_editada",
    "cadencia_config",
    updated.id,
    { statusKey, produto, passos: passos.length, ativa },
    extractRequestMeta(request),
  );
  return NextResponse.json({ ok: true });
}
