import { NextResponse, type NextRequest } from "next/server";

import { comparisonPeriod } from "@/lib/reports/comparativos";
import { periodFromFilters } from "@/lib/reports/period";
import {
  fetchConversionRates,
  fetchDistribuicoes,
  fetchEsfriandoGlobal,
  fetchKpis,
  fetchLossReasons,
  fetchMqlSql,
  fetchMqlSqlPorOrigem,
  fetchOrigemROI,
  fetchPerformanceConsultores,
  fetchPerformancePorUf,
  fetchPipelineAtivoPorStatus,
  fetchReceitaMensal,
  fetchSalesMetrics,
  fetchSlaCompliance,
  fetchTempoMedioPorStatus,
  fetchVolumePorDia,
} from "@/lib/reports/queries";
import {
  reportFiltersSchema,
  type PeriodoPreset,
} from "@/lib/validators/report";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Períodos que alguém escolhe no filtro. "hoje" e "custom" ficam de fora:
// "hoje" é barato e muda o tempo todo; "custom" não tem como prever.
const PRESETS: PeriodoPreset[] = [
  "7d",
  "30d",
  "90d",
  "mes_atual",
  "mes_anterior",
  "trimestre",
  "ano",
  "ultimos_12m",
];

/**
 * Vercel Cron a cada 10 min: recalcula o cache dos relatórios para todos os
 * períodos padrão, sem filtro extra. Assim a troca de período em /relatorios
 * e no painel executivo cai em cache quente em vez de recalcular tudo na hora.
 *
 * Substitui o antigo /api/cron/refresh-mvs (as views materializadas saíram —
 * ver comentário no topo de src/lib/reports/queries.ts).
 *
 * Em prod, valida `Authorization: Bearer ${CRON_SECRET}` injetado pelo
 * Vercel. Em dev, aceita sem auth pra facilitar curl/teste manual.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const inicio = Date.now();
  const resultado: Array<{ periodo: string; ms: number; falhas: number }> = [];

  // Um período por vez: cada um já dispara ~20 consultas em paralelo.
  for (const periodo of PRESETS) {
    const t0 = Date.now();
    const filters = reportFiltersSchema.parse({ periodo });
    const period = periodFromFilters(filters);
    const comp = comparisonPeriod(period, "anterior_equivalente");
    const tarefas = await Promise.allSettled([
      fetchKpis(filters, period),
      ...(comp
        ? [fetchKpis(filters, comp), fetchMqlSql(filters, comp), fetchSalesMetrics(filters, comp)]
        : []),
      fetchConversionRates(filters, period),
      fetchMqlSql(filters, period),
      fetchMqlSqlPorOrigem(filters, period),
      fetchVolumePorDia(filters, period),
      fetchOrigemROI(filters, period),
      fetchDistribuicoes(filters, period),
      fetchPerformanceConsultores(filters, period),
      fetchPerformancePorUf(filters, period),
      fetchLossReasons(filters, period),
      fetchSlaCompliance(filters, period),
      fetchTempoMedioPorStatus(filters, period),
      fetchSalesMetrics(filters, period),
    ]);
    const falhas = tarefas.filter((t) => t.status === "rejected");
    for (const f of falhas) {
      console.error(`[cron:aquecer-relatorios] ${periodo}:`, (f as PromiseRejectedResult).reason);
    }
    resultado.push({ periodo, ms: Date.now() - t0, falhas: falhas.length });
  }

  // Independem de período.
  const filtersPadrao = reportFiltersSchema.parse({});
  await Promise.allSettled([
    fetchPipelineAtivoPorStatus(filtersPadrao),
    fetchReceitaMensal(filtersPadrao),
    fetchEsfriandoGlobal(undefined),
  ]);

  const totalMs = Date.now() - inicio;
  console.log(JSON.stringify({ perf: "cron:aquecer-relatorios", ms: totalMs, resultado }));
  const falhou = resultado.some((r) => r.falhas > 0);
  return NextResponse.json({ ok: !falhou, totalMs, resultado }, { status: falhou ? 500 : 200 });
}
