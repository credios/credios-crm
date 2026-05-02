import {
  AlertTriangle,
  Banknote,
  Crown,
  DollarSign,
  Gauge,
  TrendingUp,
} from "lucide-react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import type { ReactNode } from "react";

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
export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ExecKpis = Awaited<ReturnType<typeof fetchKpis>>;
type ExecSalesMetrics = Awaited<ReturnType<typeof fetchSalesMetrics>>;
type ExecSpark = Awaited<ReturnType<typeof fetchSparkRevenue>>;

const EMPTY_KPIS: ExecKpis = {
  leadsNovosCount: 0,
  pipelineCount: 0,
  pipelineValorCentavos: 0,
  fechadosCount: 0,
  fechadosValorLiberadoCentavos: 0,
  fechadosComissaoCentavos: 0,
  conversaoRolling90d: { criados: 0, fechados: 0, taxa: 0 },
};

const EMPTY_SALES: ExecSalesMetrics = {
  avgDealSizeCentavos: 0,
  avgSalesCycleDays: null,
  salesVelocityCentavosPerDay: 0,
  winRate: 0,
  avgComissaoCentavos: 0,
};

const EMPTY_SPARK: ExecSpark = {
  comissao: [],
  liberado: [],
  ticketMedio: [],
  cicloMedio: [],
};

async function safeQuery<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error(`[/admin/painel-executivo:${label}]`, error);
    return fallback;
  }
}

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

  // === Tier 1 (síncrono) — só o que aparece nos 4 KPIs do topo. ===
  // KPIs + sales metrics + sparklines: tudo necessário pra renderizar os 4
  // cards executive. Demais seções sobem em Suspense abaixo.
  const [kpisCurr, kpisPrev, salesCurr, salesPrev, spark] = await Promise.all([
    safeQuery("kpis-current", fetchKpis(filters, period), EMPTY_KPIS),
    compPeriod
      ? safeQuery<ExecKpis | null>(
          "kpis-previous",
          fetchKpis(filters, compPeriod),
          null,
        )
      : Promise.resolve(null),
    safeQuery("sales-current", fetchSalesMetrics(filters, period), EMPTY_SALES),
    compPeriod
      ? safeQuery<ExecSalesMetrics | null>(
          "sales-previous",
          fetchSalesMetrics(filters, compPeriod),
          null,
        )
      : Promise.resolve(null),
    safeQuery("spark-revenue", fetchSparkRevenue(6), EMPTY_SPARK),
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

      {/* === Tier 2 (streaming) — cada seção pesada em Suspense isolado. === */}

      <Suspense fallback={<SectionSkeleton h={360} />}>
        <ReceitaMensalSection filters={filters} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton h={400} />}>
        <PipelineProjecaoSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton h={300} />}>
        <PercentisSection period={period} />
      </Suspense>

      {compMode !== "sem" && compPeriod && (
        <Suspense fallback={<SectionSkeleton h={280} />}>
          <ComparativoSection
            filters={filters}
            period={period}
            compPeriod={compPeriod}
            compMode={compMode}
          />
        </Suspense>
      )}

      <Suspense fallback={<SectionSkeleton h={300} />}>
        <DistribuicoesSection filters={filters} period={period} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton h={300} />}>
        <TopOrigensSection period={period} />
      </Suspense>
    </div>
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

async function renderSection(
  name: string,
  fn: () => Promise<ReactNode>,
): Promise<ReactNode> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[/admin/painel-executivo:${name}]`, error);
    return <SectionError title={name} />;
  }
}

function SectionError({ title }: { title: string }) {
  return (
    <div className="surface-solid rounded-xl border-destructive/25 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-destructive/10 p-2">
          <AlertTriangle className="size-4 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-sm font-semibold">
            {title} indisponível
          </h2>
          <p className="text-xs text-muted-foreground">
            Esta seção falhou ao carregar, mas o restante do painel continua
            disponível. Recarregue a página para tentar novamente.
          </p>
        </div>
      </div>
    </div>
  );
}

async function ReceitaMensalSection({ filters }: { filters: RFilters }) {
  return renderSection("Receita mensal", async () => {
    const rows = await fetchReceitaMensal(filters);
    return <ReceitaMensalExec rows={rows} />;
  });
}

async function PipelineProjecaoSection() {
  return renderSection("Pipeline e projeção", async () => {
    const [pipelineR$, proj] = await Promise.all([
      fetchPipelineEmReais(),
      fetchProjecaoMes(),
    ]);
    return (
      <div className="grid gap-4 lg:grid-cols-2 stagger [&>*]:animate-fade-up">
        <PipelineEmReais rows={pipelineR$} />
        <ProjecaoMesCard proj={proj} />
      </div>
    );
  });
}

async function PercentisSection({ period }: { period: PeriodRange }) {
  return renderSection("Percentis de tempo", async () => {
    const rows = await fetchTempoPercentis(period);
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
  return renderSection("Comparativo de períodos", async () => {
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
  return renderSection("Distribuições", async () => {
    const distrib = await fetchDistribuicoes(filters, period);
    return <DistribuicaoCards data={distrib} />;
  });
}

async function TopOrigensSection({ period }: { period: PeriodRange }) {
  return renderSection("Top origens", async () => {
    const rows = await fetchTopOrigensDetalhadas(period, 10);
    return <TopOrigens rows={rows} />;
  });
}
