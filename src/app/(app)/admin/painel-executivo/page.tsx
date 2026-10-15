import {
  Banknote,
  Crown,
  DollarSign,
  Gauge,
  TrendingUp,
} from "lucide-react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";

import { ReceitaMensalExec } from "@/components/relatorios/charts/receita-mensal-exec";
import { ComparativoPeriodos } from "@/components/relatorios/comparativo-periodos";
import { DistribuicaoCards } from "@/components/relatorios/distribuicao-cards";
import { ExecFilters } from "@/components/relatorios/exec-filters";
import { KpiExecutive } from "@/components/relatorios/kpi-executive";
import { renderSection } from "@/components/relatorios/render-section";
import {
  AreaRelatorio,
  TransicaoFiltros,
} from "@/components/relatorios/transicao-filtros";
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
import type { Produto } from "@/lib/produtos";
import {
  comparisonPeriod,
  isComparisonReliable,
  pctDelta,
  pointsDelta,
} from "@/lib/reports/comparativos";
import { periodFromFilters, type PeriodRange } from "@/lib/reports/period";
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
  type ReportFilters as RFilters,
} from "@/lib/validators/report";

// `force-dynamic` removido: dynamic naturalmente via cookies + searchParams.
export const revalidate = 60;
// 90s — ver comentário equivalente em /relatorios.
export const maxDuration = 90;

const ROTA = "/admin/painel-executivo";

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
  // Cada seção é um Suspense com `key` dos filtros: trocar um filtro remonta
  // as seções, que mostram o próprio skeleton e aparecem conforme ficam
  // prontas — em vez da página inteira esperar a seção mais lenta.
  const chave = JSON.stringify(filters);

  // Tier 1 vazio: só auth + parse de filtros (rápidos). TUDO que vem do banco
  // sobe em Suspense abaixo, inclusive os KPIs do topo. Antes, 5 queries
  // paralelas mas cada uma com 5+ sub-queries seriais somavam >60s e
  // estouravam maxDuration → 504 GATEWAY_TIMEOUT na página inteira.

  after(() =>
    logAction(null, user.id, "relatorio_acessado", "relatorio", null, {
      tipo: "executivo",
      periodo: period.preset,
      comparar: compMode,
    }),
  );

  return (
    <TransicaoFiltros>
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

      <AreaRelatorio>

        {/* KPIs estratégicos com sparklines — Suspense próprio pra não travar
            o resto da página caso alguma das queries internas demore. */}
        <Suspense key={`${chave}:1`} fallback={<KpisSkeleton />}>
          <KpisSection
            filters={filters}
            period={period}
            compPeriod={compPeriod}
          />
        </Suspense>

        {/* === Tier 2 (streaming) — cada seção pesada em Suspense isolado. === */}

        <Suspense key={`${chave}:2`} fallback={<SectionSkeleton h={360} />}>
          <ReceitaMensalSection filters={filters} />
        </Suspense>

        <Suspense key={`${chave}:3`} fallback={<SectionSkeleton h={400} />}>
          <PipelineProjecaoSection produto={filters.produto} />
        </Suspense>

        <Suspense key={`${chave}:4`} fallback={<SectionSkeleton h={300} />}>
          <PercentisSection period={period} produto={filters.produto} />
        </Suspense>

        {compMode !== "sem" && compPeriod && (
          <Suspense key={`${chave}:5`} fallback={<SectionSkeleton h={280} />}>
            <ComparativoSection
              filters={filters}
              period={period}
              compPeriod={compPeriod}
              compMode={compMode}
            />
          </Suspense>
        )}

        <Suspense key={`${chave}:6`} fallback={<SectionSkeleton h={300} />}>
          <DistribuicoesSection filters={filters} period={period} />
        </Suspense>

        <Suspense key={`${chave}:7`} fallback={<SectionSkeleton h={300} />}>
          <TopOrigensSection period={period} produto={filters.produto} />
        </Suspense>
      </AreaRelatorio>
    </div>
    </TransicaoFiltros>
  );
}

// ============================================================================
// Server Components de seção — cada um faz seu próprio fetch.
// Falhas isoladas via Suspense; a página nunca derruba inteira.
// ============================================================================

function SectionSkeleton({ h }: { h: number }) {
  return (
    <div
      className="surface-solid rounded-xl animate-pulse"
      style={{ height: h }}
      aria-hidden
    />
  );
}

function KpisSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="surface-solid rounded-xl animate-pulse h-32"
          aria-hidden
        />
      ))}
    </div>
  );
}

async function KpisSection({
  filters,
  period,
  compPeriod,
}: {
  filters: RFilters;
  period: PeriodRange;
  compPeriod: PeriodRange | null;
}) {
  return renderSection(ROTA, "KPIs executivos", async () => {
    // Tudo que os 4 KPI cards do topo precisam, em paralelo. Com fetchKpis
    // e fetchSalesMetrics agora paralelizadas internamente, esta seção
    // termina rápido mesmo em pico.
    const [kpisCurr, kpisPrev, salesCurr, salesPrev, spark] = await Promise.all([
      fetchKpis(filters, period),
      compPeriod ? fetchKpis(filters, compPeriod) : Promise.resolve(null),
      fetchSalesMetrics(filters, period),
      compPeriod
        ? fetchSalesMetrics(filters, compPeriod)
        : Promise.resolve(null),
      fetchSparkRevenue(6, filters.produto),
    ]);

    // Esconde deltas quando a janela de comparação não tem volume suficiente
    // pra ser confiável (períodos longos caem antes da operação existir).
    const comparavel = isComparisonReliable(kpisPrev?.leadsNovosCount);

    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 stagger [&>*]:animate-fade-up">
        <KpiExecutive
          icon={DollarSign}
          tone="premium"
          label="Receita realizada"
          value={formatBrlShort(kpisCurr.fechadosComissaoCentavos)}
          deltaPct={
            comparavel && kpisPrev
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
            comparavel && kpisPrev
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
            comparavel && salesPrev
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
            comparavel &&
            salesPrev &&
            salesPrev.avgSalesCycleDays &&
            salesCurr.avgSalesCycleDays
              ? -pointsDelta(
                  salesCurr.avgSalesCycleDays,
                  salesPrev.avgSalesCycleDays,
                )
              : null
          }
          deltaLabel="dias · menor é melhor"
          spark={spark.cicloMedio}
        />
      </div>
    );
  });
}

async function ReceitaMensalSection({ filters }: { filters: RFilters }) {
  return renderSection(ROTA, "Receita mensal", async () => {
    const rows = await fetchReceitaMensal(filters);
    return <ReceitaMensalExec rows={rows} />;
  });
}

async function PipelineProjecaoSection({ produto }: { produto?: Produto }) {
  return renderSection(ROTA, "Pipeline e projeção", async () => {
    const [pipelineR$, proj] = await Promise.all([
      fetchPipelineEmReais(produto),
      fetchProjecaoMes(produto),
    ]);
    return (
      <div className="grid gap-4 lg:grid-cols-2 stagger [&>*]:animate-fade-up">
        <PipelineEmReais rows={pipelineR$} />
        <ProjecaoMesCard proj={proj} />
      </div>
    );
  });
}

async function PercentisSection({
  period,
  produto,
}: {
  period: PeriodRange;
  produto?: Produto;
}) {
  return renderSection(ROTA, "Percentis de tempo", async () => {
    const rows = await fetchTempoPercentis(period, produto);
    return <PercentisTempo rows={rows} />;
  });
}

async function ComparativoSection({
  filters,
  period,
  compPeriod,
  compMode,
}: {
  filters: RFilters;
  period: PeriodRange;
  compPeriod: PeriodRange;
  compMode: ComparacaoMode;
}) {
  return renderSection(ROTA, "Comparativo de períodos", async () => {
    const rows = await fetchComparativoPeriodos(filters, period, compPeriod);
    if (rows.length === 0) return null;
    return (
      <ComparativoPeriodos
        rows={rows}
        comparisonLabel={COMPARACAO_LABEL[compMode]}
      />
    );
  });
}

async function DistribuicoesSection({
  filters,
  period,
}: {
  filters: RFilters;
  period: PeriodRange;
}) {
  return renderSection(ROTA, "Distribuições", async () => {
    const distrib = await fetchDistribuicoes(filters, period);
    return <DistribuicaoCards data={distrib} />;
  });
}

async function TopOrigensSection({
  period,
  produto,
}: {
  period: PeriodRange;
  produto?: Produto;
}) {
  return renderSection(ROTA, "Top origens", async () => {
    const rows = await fetchTopOrigensDetalhadas(period, 10, produto);
    return <TopOrigens rows={rows} />;
  });
}
