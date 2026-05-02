import "server-only";

import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { statusLeadConfig } from "../../../db/schema";
import { db } from "@/lib/db";

import { SYSTEM_STATUS_LABEL } from "./canonical";

export type StatusConfig = {
  id: string;
  key: string;
  label: string;
  ordem: number;
  ativo: boolean;
  eTerminal: boolean;
  eSistema: boolean;
  cor: string | null;
};

// Status config muda raramente (admin via UI). Cache 5 min — todas as
// listagens (Kanban, filtros, dropdowns) deixam de tocar o banco em cada
// page render. Invalidação implícita por TTL.

/** Lista TODOS os status (ativos e inativos), ordem crescente. Admin UI. */
export const listAllStatuses = unstable_cache(
  async (): Promise<StatusConfig[]> => {
    return db
      .select()
      .from(statusLeadConfig)
      .orderBy(asc(statusLeadConfig.ordem));
  },
  ["status:list-all"],
  { revalidate: 300, tags: ["status:config"] },
);

/** Lista só os ativos. Usado em UI normal (filtros, kanban, dropdowns). */
export const listActiveStatuses = unstable_cache(
  async (): Promise<StatusConfig[]> => {
    return db
      .select()
      .from(statusLeadConfig)
      .where(eq(statusLeadConfig.ativo, true))
      .orderBy(asc(statusLeadConfig.ordem));
  },
  ["status:list-active"],
  { revalidate: 300, tags: ["status:config"] },
);

/** Mapa key->label, com fallback pro label sistema (caso DB falhe). */
export async function getStatusLabelMap(): Promise<Record<string, string>> {
  const rows = await listAllStatuses().catch(() => [] as StatusConfig[]);
  const map: Record<string, string> = { ...SYSTEM_STATUS_LABEL };
  for (const r of rows) map[r.key] = r.label;
  return map;
}
