import "server-only";

import { and, asc, eq } from "drizzle-orm";
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
    produto: r.produto,
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

/**
 * Cadência ATIVA de um status PARA UM PRODUTO (null = sem cadência). Produto
 * sem cadência configurada não herda a de outro: os passos e textos de CGI
 * não servem pra um síndico.
 */
export async function cadenciaDoStatus(
  statusKey: string,
  produto: string | null | undefined = "CGI",
): Promise<CadenciaStatus | null> {
  const todas = await listCadencias();
  const c = todas.find(
    (x) => x.statusKey === statusKey && x.produto === (produto ?? "CGI") && x.ativa,
  );
  return c && c.passos.length > 0 ? c : null;
}

/** A cadência ativa que vale pra este lead (status + produto), numa lista já carregada. */
export function cadenciaDoLead(
  cadencias: CadenciaStatus[],
  lead: { status: string; produto?: string | null },
): CadenciaStatus | undefined {
  return cadencias.find(
    (c) => c.statusKey === lead.status && c.produto === (lead.produto ?? "CGI") && c.ativa,
  );
}

/** Lookup direto no banco (sem cache) — usado pelo editor do admin. */
export async function cadenciaDoStatusFresh(statusKey: string, produto = "CGI") {
  const [r] = await db
    .select()
    .from(cadenciaConfig)
    .where(and(eq(cadenciaConfig.statusKey, statusKey), eq(cadenciaConfig.produto, produto)))
    .limit(1);
  return r ?? null;
}
