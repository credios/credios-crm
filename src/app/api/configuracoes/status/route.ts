import { asc, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { statusLeadConfig } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { createStatusSchema } from "@/lib/validators/status";

export const dynamic = "force-dynamic";

/**
 * GET — lista TODOS os status (ativos + inativos), ordenados.
 * Admin only — UI de configuração precisa ver até os desativados.
 *
 * Pra listar só ativos pra dropdowns, usa server-side `listActiveStatuses`
 * de `lib/status/queries`.
 */
export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data = await db
    .select()
    .from(statusLeadConfig)
    .orderBy(asc(statusLeadConfig.ordem));
  return NextResponse.json({ data });
}

/**
 * POST — criar status custom novo. `e_sistema=false` automaticamente.
 * Pega o próximo `ordem` disponível (max + 10) pra entrar no fim do funil.
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

  const parsed = createStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${statusLeadConfig.ordem}), 0)::int` })
    .from(statusLeadConfig);
  const novaOrdem = (maxRow?.max ?? 0) + 10;

  try {
    const [created] = await db
      .insert(statusLeadConfig)
      .values({
        key: data.key,
        label: data.label,
        ordem: novaOrdem,
        ativo: true,
        eTerminal: data.eTerminal,
        eSistema: false,
        cor: data.cor ?? null,
      })
      .returning();

    void logAction(
      null,
      user.id,
      "status_criado",
      "status_lead_config",
      created.id,
      { key: data.key, label: data.label },
      extractRequestMeta(request),
    );

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    // Unique violation no `key`.
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: `Já existe status com a chave "${data.key}"` },
        { status: 409 },
      );
    }
    throw e;
  }
}
