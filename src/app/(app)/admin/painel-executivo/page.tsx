import { Banknote, Crown, DollarSign, Gauge, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { ReceitaMensalExec } from "@/components/relatorios/charts/receita-mensal-exec";
import { ComparativoPeriodos } from "@/components/relatorios/comparativo-periodos";
import { DistribuicaoCards } from "@/components/relatorios/distribuicao-cards";
import { ExecFilters } from "@/components/relatorios/exec-filters";
import { KpiExecutive } from "@/components/relatorios/kpi-executive";
import { PercentisTempo } from "@/components/relatorios/percentis-tempo";
import { PipelineEmReais } from "@/components/relatorios/pipeline-em-reais";
import { ProjecaoMesCard } from "@/components/relatorios/projecao-mes";
import { TopOrigens } from "@/components/relatorios/top-origens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { formatBrlShort } from "@/lib/formatters/currency";
import {
  comparisonPeriod,
  pctDelta,
  pointsDelta,
} from "@/lib/reports/comparativos";
import { periodFromFilters } from "@/lib/reports/period";
import {
  fetchComparativoPeriodos,
  fetchDistribuicoes,
  fetchKpis,
  fetchPipelineEmReais,
  fetchProjecaoMes,
  fetchReceitaMensal,
  fetchSalesMetrics,
  fetchSparkRevenue,
  fetchTempoPercentis,
  fetchTopOrigensDetalhadas,
} from "@/lib/reports/queries";
import {
  COMPARACAO_LABEL,
  reportFiltersSchema,
  type ComparacaoMode,
} from "@/lib/validators/report";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PainelExecutivoPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/sem-permissao");

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }
  const filters = reportFiltersSchema.parse({
    ...flat,
    periodo: flat.periodo ?? "mes_atual",
  });
  const period = periodFromFilters(filters);
  const compMode: ComparacaoMode = filters.comparar;
  const compPeriod = comparisonPeriod(period, compMode);

  const [
    kpisCurr,
    kpisPrev,
    salesCurr,
    salesPrev,
    receita12m,
    proj,
    pipelineR$,
    percentis,
    topOrigens,
    comparativo,
    spark,
    distrib,
  ] = await Promise.all([
    fetchKpis(filters, period),
    compPeriod ? fetchKpis(filters, compPeriod) : Promise.resolve(null),
    fetchSalesMetrics(filters, period),
    compPeriod ? fetchSalesMetrics(filters, compPeriod) : Promise.resolve(null),
    fetchReceitaMensal(filters),
    fetchProjecaoMes(),
    fetchPipelineEmReais(),
    fetchTempoPercentis(period),
    fetchTopOrigensDetalhadas(period, 10),
    compPeriod
      ? fetchComparativoPeriodos(filters, period, compPeriod)
      : Promise.resolve([]),
    fetchSparkRevenue(6),
    fetchDistribuicoes(filters, period),
  ]);

  after(() =>
    logAction(null, user.id, "relatorio_acessado", "relatorio", null, {
      tipo: "executivo",
      periodo: period.preset,
      comparar: compMode,
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Crown
              className="size-6 text-gold-700 dark:text-gold-400"
              strokeWidth={1.75}
            />
            Painel executivo
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Visão estratégica · acesso restrito ·{" "}
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
              {period.label}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="soft-gold">Admin</Badge>
          <Button variant="outline" size="sm" disabled title="Em breve">
            Exportar PDF
          </Button>
        </div>
      </div>

      <ExecFilters />

      {/* KPIs estratégicos com sparklines */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 stagger [&>*]:animate-fade-up">
        <KpiExecutive
          icon={DollarSign}
          tone="premium"
          label="Receita realizada"
          value={formatBrlShort(kpisCurr.fechadosComissaoCentavos)}
          deltaPct={
            kpisPrev
              ? pctDelta(
                  kpisCurr.fechadosComissaoCentavos,
                  kpisPrev.fechadosComissaoCentavos,
                )
              : null
          }
          deltaLabel={`vs ${compPeriod?.label.toLowerCase() ?? "—"}`}
          spark={spark.comissao}
        />
        <KpiExecutive
          icon={Banknote}
          tone="growth"
          label="Volume liberado"
          value={formatBrlShort(kpisCurr.fechadosValorLiberadoCentavos)}
          deltaPct={
            kpisPrev
              ? pctDelta(
                  kpisCurr.fechadosValorLiberadoCentavos,
                  kpisPrev.fechadosValorLiberadoCentavos,
                )
              : null
          }
          deltaLabel={`vs ${compPeriod?.label.toLowerCase() ?? "—"}`}
          spark={spark.liberado}
        />
        <KpiExecutive
          icon={TrendingUp}
          label="Ticket médio"
          value={
            salesCurr.avgDealSizeCentavos > 0
              ? formatBrlShort(salesCurr.avgDealSizeCentavos)
              : "—"
          }
          deltaPct={
            salesPrev
              ? pctDelta(
                  salesCurr.avgDealSizeCentavos,
                  salesPrev.avgDealSizeCentavos,
                )
              : null
          }
          deltaLabel={`vs ${compPeriod?.label.toLowerCase() ?? "—"}`}
          spark={spark.ticketMedio}
        />
        <KpiExecutive
          icon={Gauge}
          label="Ciclo de venda"
          value={
            salesCurr.avgSalesCycleDays != null
              ? `${salesCurr.avgSalesCycleDays.toFixed(0)}d`
              : "—"
          }
          deltaPct={
            salesPrev && salesPrev.avgSalesCycleDays && salesCurr.avgSalesCycleDays
              ? // ciclo menor é melhor → invertemos sinal pra "verde = melhorou"
                -pointsDelta(
                  salesCurr.avgSalesCycleDays,
                  salesPrev.avgSalesCycleDays,
                )
              : null
          }
          deltaLabel="dias · menor é melhor"
          spark={spark.cicloMedio}
        />
      </div>

      {/* Receita 12 meses (escala corrigida) */}
      <ReceitaMensalExec rows={receita12m} />

      {/* Pipeline R$ + Projeção */}
      <div className="grid gap-4 lg:grid-cols-2 stagger [&>*]:animate-fade-up">
        <PipelineEmReais rows={pipelineR$} />
        <ProjecaoMesCard proj={proj} />
      </div>

      {/* Distribuição de tempo (percentis) */}
      <PercentisTempo rows={percentis} />

      {/* Comparativo de períodos */}
      {compMode !== "sem" && comparativo.length > 0 && (
        <ComparativoPeriodos
          rows={comparativo}
          comparisonLabel={COMPARACAO_LABEL[compMode]}
        />
      )}

      {/* Perfil dos leads — quem está entrando */}
      <DistribuicaoCards data={distrib} />

      {/* Top origens detalhadas */}
      <TopOrigens rows={topOrigens} />
    </div>
  );
}
