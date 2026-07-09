import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { comparisonPeriod } from "@/lib/reports/comparativos";
import { periodFromFilters } from "@/lib/reports/period";
import {
  fetchConversionRates,
  fetchDistribuicoes,
  fetchKpis,
  fetchMqlSql,
  fetchPipelineAtivoPorStatus,
  fetchTempoMedioPorStatus,
  fetchVolumePorDia,
} from "@/lib/reports/queries";
import { reportFiltersSchema } from "@/lib/validators/report";

export const dynamic = "force-dynamic";
// Refresh CONCURRENTLY pode ser lento em datasets grandes (escala com nº
// de rows da MV, não da tabela). Damos folga até 90s pra completar mesmo
// quando a tabela leads cresce muito.
export const maxDuration = 90;

/**
 * Vercel Cron a cada 30 min: REFRESH MATERIALIZED VIEW CONCURRENTLY de
 * mv_leads_diarios e mv_fechados_diarios (ver db/migrations/0010).
 *
 * CONCURRENTLY = lock leve, não bloqueia SELECTs de leitores. Requer
 * UNIQUE INDEX (já criados na migration 0010).
 *
 * Em prod, valida `Authorization: Bearer ${CRON_SECRET}` injetado pelo
 * Vercel. Em dev, aceita sem auth pra facilitar curl/teste manual.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  const results: Array<{
    view: string;
    durationMs: number;
    error?: string;
  }> = [];

  for (const view of ["mv_leads_diarios", "mv_fechados_diarios"] as const) {
    const t0 = Date.now();
    try {
      // sql.raw porque o nome da MV não é parametrizável; valor é literal
      // controlado pelo array acima — sem risco de injection.
      await db.execute(
        sql.raw(`REFRESH MATERIALIZED VIEW CONCURRENTLY public.${view}`),
      );
      results.push({ view, durationMs: Date.now() - t0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron:refresh-mvs] failed ${view}:`, message);
      results.push({ view, durationMs: Date.now() - t0, error: message });
    }
  }

  // ── Pré-aquecimento do cache dos relatórios ──
  // As queries dos relatórios são unstable_cache de 5 min; a PRIMEIRA visita
  // depois do TTL pagava a carga fria (a sensação de "clicar e recarregar até
  // aparecer"). O cron reaquece o combo default (sem filtros, últimos 30d) a
  // cada 30 min — quem abre /relatorios cai em cache quente. Best-effort.
  let warmMs = 0;
  try {
    const t0 = Date.now();
    const filters = reportFiltersSchema.parse({});
    const period = periodFromFilters(filters);
    const compPeriod = comparisonPeriod(period, "anterior_equivalente");
    await Promise.allSettled([
      fetchKpis(filters, period),
      ...(compPeriod ? [fetchKpis(filters, compPeriod)] : []),
      fetchConversionRates(filters, period),
      fetchVolumePorDia(filters, period),
      fetchPipelineAtivoPorStatus(filters),
      fetchTempoMedioPorStatus(filters, period),
      fetchDistribuicoes(filters, period),
      fetchMqlSql(filters, period),
    ]);
    warmMs = Date.now() - t0;
  } catch (e) {
    console.error("[cron:refresh-mvs] cache warm falhou:", e);
  }

  const totalMs = Date.now() - startedAt;
  const hasFailure = results.some((r) => r.error);

  return NextResponse.json(
    {
      ok: !hasFailure,
      totalMs,
      warmMs,
      refreshed: results,
    },
    { status: hasFailure ? 500 : 200 },
  );
}
