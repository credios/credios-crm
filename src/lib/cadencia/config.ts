import "server-only";

import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { cadenciaConfig } from "../../../db/schema";
import { db } from "@/lib/db";

// Configuração das cadências de follow-up (playbook executável). Editável pelo
// Admin em /configuracoes/cadencias; cache 5 min com tag pra invalidação.

export type { CadenciaStatus, PassoCadencia, PassoTipo } from "@/lib/cadencia/tipos";
import type { CadenciaStatus, PassoCadencia } from "@/lib/cadencia/tipos";

export const CADENCIA_CACHE_TAG = "cadencia:config";

async function fetchCadencias(): Promise<CadenciaStatus[]> {
  const rows = await db
    .select()
    .from(cadenciaConfig)
    .orderBy(asc(cadenciaConfig.statusKey));
  return rows.map((r) => ({
    id: r.id,
    statusKey: r.statusKey,
    passos: (r.passos ?? []) as PassoCadencia[],
    ativa: r.ativa,
  }));
}

const listCadenciasCached = unstable_cache(fetchCadencias, ["cadencia:list"], {
  revalidate: 300,
  tags: [CADENCIA_CACHE_TAG],
});

/** Lista as cadências (cache 5 min). Fora do runtime Next (scripts/smoke) o
 *  unstable_cache não funciona — cai pro fetch direto, sem quebrar. */
export async function listCadencias(): Promise<CadenciaStatus[]> {
  try {
    return await listCadenciasCached();
  } catch {
    return fetchCadencias();
  }
}

/** Cadência ATIVA de um status (null = status sem cadência). */
export async function cadenciaDoStatus(statusKey: string): Promise<CadenciaStatus | null> {
  const todas = await listCadencias();
  const c = todas.find((x) => x.statusKey === statusKey && x.ativa);
  return c && c.passos.length > 0 ? c : null;
}

/** Lookup direto no banco (sem cache) — usado pelo editor do admin. */
export async function cadenciaDoStatusFresh(statusKey: string) {
  const [r] = await db
    .select()
    .from(cadenciaConfig)
    .where(eq(cadenciaConfig.statusKey, statusKey))
    .limit(1);
  return r ?? null;
}
