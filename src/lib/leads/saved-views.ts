import "server-only";

import { desc, eq } from "drizzle-orm";

import { savedLeadViews } from "../../../db/schema";
import { db } from "@/lib/db";
import type { SavedLeadView, ViewMode } from "@/lib/validators/lead-view";

/** Visualizações salvas do usuário, mais recentes primeiro. */
export async function getSavedLeadViews(
  userId: string,
): Promise<SavedLeadView[]> {
  const rows = await db
    .select({
      id: savedLeadViews.id,
      nome: savedLeadViews.nome,
      viewMode: savedLeadViews.viewMode,
      filtros: savedLeadViews.filtros,
      createdAt: savedLeadViews.createdAt,
    })
    .from(savedLeadViews)
    .where(eq(savedLeadViews.userId, userId))
    .orderBy(desc(savedLeadViews.createdAt));

  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    viewMode: (r.viewMode === "kanban" ? "kanban" : "lista") as ViewMode,
    filtros: (r.filtros ?? {}) as Record<string, string>,
    createdAt: r.createdAt.toISOString(),
  }));
}
