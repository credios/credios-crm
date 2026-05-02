import "server-only";

import { asc, eq } from "drizzle-orm";

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

/** Lista TODOS os status (ativos e inativos), ordem crescente. Admin UI. */
export async function listAllStatuses(): Promise<StatusConfig[]> {
  return db.select().from(statusLeadConfig).orderBy(asc(statusLeadConfig.ordem));
}

/** Lista só os ativos. Usado em UI normal (filtros, kanban, dropdowns). */
export async function listActiveStatuses(): Promise<StatusConfig[]> {
  return db
    .select()
    .from(statusLeadConfig)
    .where(eq(statusLeadConfig.ativo, true))
    .orderBy(asc(statusLeadConfig.ordem));
}

/** Mapa key->label, com fallback pro label sistema (caso DB falhe). */
export async function getStatusLabelMap(): Promise<Record<string, string>> {
  const rows = await listAllStatuses().catch(() => [] as StatusConfig[]);
  const map: Record<string, string> = { ...SYSTEM_STATUS_LABEL };
  for (const r of rows) map[r.key] = r.label;
  return map;
}
