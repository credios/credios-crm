import { asc, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { cadenciaConfig, mensagensTemplate } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { CADENCIA_CACHE_TAG } from "@/lib/cadencia/config";
import { db } from "@/lib/db";

// Config das cadências de follow-up — Admin edita dias/passos/templates/energia
// pela UI, sem deploy (/configuracoes/cadencias).

const passoSchema = z.object({
  titulo: z.string().min(1).max(120),
  deltaDias: z.number().int().min(0).max(60),
  tipo: z.enum(["mensagem", "ligacao", "decisao"]),
  templateId: z.string().uuid().nullable(),
  energia: z.string().max(160).nullable(),
});

const putSchema = z.object({
  statusKey: z.string().min(1),
  ativa: z.boolean(),
  passos: z.array(passoSchema).min(1).max(12),
});

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const [cadencias, templates] = await Promise.all([
    db.select().from(cadenciaConfig).orderBy(asc(cadenciaConfig.statusKey)),
    db
      .select({ id: mensagensTemplate.id, nome: mensagensTemplate.nome })
      .from(mensagensTemplate)
      .where(eq(mensagensTemplate.ativa, true))
      .orderBy(asc(mensagensTemplate.nome)),
  ]);
  return NextResponse.json({ cadencias, templates });
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
  const { statusKey, passos, ativa } = parsed.data;

  // O último passo deve ser a decisão (o coletor e a Mesa dependem disso);
  // passos de mensagem precisam de template.
  if (passos[passos.length - 1]!.tipo !== "decisao") {
    return NextResponse.json(
      { error: "o último passo precisa ser do tipo 'decisao'" },
      { status: 400 },
    );
  }
  if (passos.some((p) => p.tipo === "mensagem" && !p.templateId)) {
    return NextResponse.json(
      { error: "todo passo de mensagem precisa de um template" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(cadenciaConfig)
    .set({ passos: passos as never, ativa, updatedAt: new Date() })
    .where(eq(cadenciaConfig.statusKey, statusKey))
    .returning({ id: cadenciaConfig.id });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  revalidateTag(CADENCIA_CACHE_TAG, "max");
  void logAction(
    null,
    user.id,
    "cadencia_editada",
    "cadencia_config",
    updated.id,
    { statusKey, passos: passos.length, ativa },
    extractRequestMeta(request),
  );
  return NextResponse.json({ ok: true });
}
