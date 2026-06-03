import { desc, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { savedLeadViews } from "../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";
import {
  createSavedViewSchema,
  MAX_SAVED_VIEWS,
  sanitizeFiltros,
} from "@/lib/validators/lead-view";

/** GET /api/lead-views — visualizações salvas do usuário logado. */
export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(savedLeadViews)
    .where(eq(savedLeadViews.userId, user.id))
    .orderBy(desc(savedLeadViews.createdAt));

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      viewMode: r.viewMode,
      filtros: r.filtros ?? {},
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/** POST /api/lead-views — cria visualização para o usuário logado. */
export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = createSavedViewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "validation failed",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(savedLeadViews)
    .where(eq(savedLeadViews.userId, user.id));
  if (count >= MAX_SAVED_VIEWS) {
    return NextResponse.json(
      {
        error: `Limite de ${MAX_SAVED_VIEWS} visualizações atingido. Exclua alguma antes de salvar.`,
      },
      { status: 400 },
    );
  }

  const filtros = sanitizeFiltros(parsed.data.filtros);
  const [created] = await db
    .insert(savedLeadViews)
    .values({
      userId: user.id,
      nome: parsed.data.nome,
      viewMode: parsed.data.viewMode,
      filtros,
    })
    .returning();

  return NextResponse.json(
    {
      data: {
        id: created.id,
        nome: created.nome,
        viewMode: created.viewMode,
        filtros: created.filtros ?? {},
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
