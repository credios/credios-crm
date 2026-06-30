import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Clock,
  Snowflake,
  Target,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import type { ReactNode } from "react";

import { ConversionFunnel } from "@/components/relatorios/charts/conversion-funnel";
import { LossReasonsChart } from "@/components/relatorios/charts/loss-reasons";
import { OrigemROITable } from "@/components/relatorios/charts/origem-roi";
import { PerformanceConsultoresTable } from "@/components/relatorios/charts/performance-consultores";
import { PerformanceUfTable } from "@/components/relatorios/charts/performance-uf";
import { PipelineStatusChart } from "@/components/relatorios/charts/pipeline-status";
import { TempoMedioChart } from "@/components/relatorios/charts/tempo-medio";
import { VolumePorDiaChart } from "@/components/relatorios/charts/volume-por-dia";
import { DistribuicaoCards } from "@/components/relatorios/distribuicao-cards";
import { KpiCard } from "@/components/relatorios/kpi-card";
import { MqlSqlFunil } from "@/components/relatorios/mql-sql-funil";
import { ReportFilters } from "@/components/relatorios/report-filters";
import { Badge } from "@/components/ui/badge";
import { logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { formatBrlShort } from "@/lib/formatters/currency";
import {
  comparisonPeriod,
  pctDelta,
  pointsDelta,
} from "@/lib/reports/comparativos";
import { periodFromFilters, type PeriodRange } from "@/lib/reports/period";
import {
  fetchConsultoresAtivos,
  fetchConversionRates,
  fetchDistribuicoes,
  fetchEsfriandoGlobal,
  fetchKpis,
  fetchLossReasons,
  fetchMqlSql,
  fetchMqlSqlPorOrigem,
  fetchOrigemROI,
  fetchOrigensDistintas,
  fetchPerformanceConsultores,
  fetchPerformancePorUf,
  fetchPipelineAtivoPorStatus,
  fetchSlaCompliance,
  fetchTempoMedioPorStatus,
  fetchUfsDistintas,
  fetchVolumePorDia,
} from "@/lib/reports/queries";
import {
  reportFiltersSchema,
  type ReportFilters as RFilters,
} from "@/lib/validators/report";

// `force-dynamic` removido: a página já é dinâmica por usar cookies (auth)
// e searchParams. Sem ele, o Next aplica o `revalidate = 60` ao Data Cache
// dos fetches/queries cacheados (ver unstable_cache em queries.ts).
export const revalidate = 60;
// 90s — dá folga pras seções pesadas (Distribuições, Comparativo) terminarem
// quando o cache estiver frio. Suspenses individuais cortam em 25s próprio.
export const maxDuration = 90;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RelatoriosPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  // Gate: consultor não acessa /relatorios.
  if (user.perfil === "consultor") {
    redirect("/sem-permissao");
  }

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }
  const filters = reportFiltersSchema.parse(flat);
  const period = periodFromFilters(filters);
  const compPeriod = comparisonPeriod(period, "anterior_equivalente");

  const isMarketing = user.perfil === "marketing";
  const canSeeFinancial = user.perfil === "admin";
  // gerente vê pipeline + R$ buscado mas NÃO vê R$ liberado/comissão.
  const hideFinancial = !canSeeFinancial;
  const isAdminGerente = isAdminOrGerente(user);

  // Tier 1 vazio: só auth + parse de filtros (rápidos). Todo dado de banco
  // sobe em Suspense abaixo, inclusive os KPIs do topo e os filtros — antes,
  // se UMA das 5 queries de Tier 1 travasse, a página inteira ficava esperando
  // o maxDuration (60s) e voltava 504. Agora o layout aparece imediatamente.

  // Audit não-crítico (page view): após response (after de next/server).
  after(() =>
    logAction(null, user.id, "relatorio_acessado", "relatorio", null, {
      tipo: "gerencial",
      periodo: period.preset,
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
            Relatórios
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Visão consolidada da operação ·{" "}
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
              {period.label}
            </span>
          </p>
        </div>
        <Badge variant={canSeeFinancial ? "soft-gold" : "soft"}>
          {isMarketing ? "Visão de marketing" : "Acesso completo"}
        </Badge>
      </div>

      <Suspense fallback={<FiltersSkeleton />}>
        <FiltersSection isMarketing={isMarketing} />
      </Suspense>

      <Suspense fallback={<KpisSkeleton />}>
        <KpisSection
          filters={filters}
          period={period}
          compPeriod={compPeriod}
          canSeeFinancial={canSeeFinancial}
        />
      </Suspense>

      {/* === Tier 2 (streaming) — cada Suspense renderiza independente. ===
          Uma query lenta/falha numa seção não derruba a página inteira;
          enquanto resolve, o usuário vê o skeleton da seção e o resto da
          página já interativa. */}

      <Suspense fallback={<SectionSkeleton h={320} />}>
        <FunilSection filters={filters} period={period} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton h={460} />}>
        <MqlSqlSection
          filters={filters}
          period={period}
          compPeriod={compPeriod}
        />
      </Suspense>

      <Suspense fallback={<SectionSkeleton h={320} />}>
        <VolumeSection filters={filters} period={period} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton h={400} />}>
        <PipelineOrigemSection
          filters={filters}
          period={period}
          hideFinancial={hideFinancial}
        />
      </Suspense>

      <Suspense fallback={<SectionSkeleton h={300} />}>
        <DistribuicoesSection filters={filters} period={period} />
      </Suspense>

      {isAdminGerente && (
        <Suspense fallback={<SectionSkeleton h={280} />}>
          <PerformanceConsultoresSection filters={filters} period={period} />
        </Suspense>
      )}

      <Suspense fallback={<SectionSkeleton h={300} />}>
        <UfLossSection
          filters={filters}
          period={period}
          hideFinancial={hideFinancial}
        />
      </Suspense>

      <Suspense fallback={<SectionSkeleton h={400} />}>
        <SaudeOperacionalSection filters={filters} period={period} />
      </Suspense>
    </div>
  );
}

// ============================================================================
// Server Components de seção — cada um faz seu próprio fetch e renderiza.
// Mantidos no mesmo arquivo pra coesão (são pequenos e específicos da page).
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

// Timeout por seção: evita que uma query lenta deixe o Suspense pendurado
// até o maxDuration da função (60s) e o user veja skeleton infinito sem
// feedback. 25s é generoso pra qualquer query honesta — acima disso é falha.
const SECTION_TIMEOUT_MS = 25_000;

async function renderSection(
  name: string,
  fn: () => Promise<ReactNode>,
): Promise<ReactNode> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new Error(
                `section "${name}" timed out after ${SECTION_TIMEOUT_MS}ms`,
              ),
            ),
          SECTION_TIMEOUT_MS,
        );
      }),
    ]);
    return result;
  } catch (error) {
    console.error(`[/relatorios:${name}]`, error);
    return <SectionError title={name} />;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
            Esta seção falhou ao carregar, mas o restante do relatório continua
            disponível. Recarregue a página para tentar novamente.
          </p>
        </div>
      </div>
    </div>
  );
}

function FiltersSkeleton() {
  return (
    <div className="surface-solid rounded-xl animate-pulse h-24" aria-hidden />
  );
}

async function FiltersSection({ isMarketing }: { isMarketing: boolean }) {
  return renderSection("Filtros", async () => {
    // 3 listas pequenas em paralelo (cacheadas via unstable_cache nas queries).
    const [consultores, origens, ufs] = await Promise.all([
      fetchConsultoresAtivos(),
      fetchOrigensDistintas(),
      fetchUfsDistintas(),
    ]);
    return (
      <ReportFilters
        consultores={consultores}
        origens={origens}
        ufs={ufs}
        hideFaixaValor={isMarketing}
      />
    );
  });
}

function KpisSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="surface-solid rounded-xl animate-pulse h-28"
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
  canSeeFinancial,
}: {
  filters: RFilters;
  period: PeriodRange;
  compPeriod: PeriodRange | null;
  canSeeFinancial: boolean;
}) {
  return renderSection("KPIs principais", async () => {
    const [kpisCurr, kpisPrev] = await Promise.all([
      fetchKpis(filters, period),
      compPeriod ? fetchKpis(filters, compPeriod) : Promise.resolve(null),
    ]);
    const conversaoPct = (kpisCurr.conversaoRolling90d.taxa * 100).toFixed(1);
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 stagger [&>*]:animate-fade-up">
        <KpiCard
          icon={Users}
          label="Leads novos"
          value={String(kpisCurr.leadsNovosCount)}
          hint="entradas no período"
          deltaPct={
            kpisPrev
              ? pctDelta(kpisCurr.leadsNovosCount, kpisPrev.leadsNovosCount)
              : null
          }
        />
        <KpiCard
          icon={ArrowDownUp}
          label="Pipeline ativo"
          value={String(kpisCurr.pipelineCount)}
          hint={`${formatBrlShort(kpisCurr.pipelineValorCentavos)} buscado`}
        />
        <KpiCard
          icon={CheckCircle2}
          tone={canSeeFinancial ? "premium" : "default"}
          label="Fechamentos"
          value={String(kpisCurr.fechadosCount)}
          hint={
            canSeeFinancial
              ? `${formatBrlShort(kpisCurr.fechadosValorLiberadoCentavos)} liberado`
              : "no período"
          }
          deltaPct={
            kpisPrev
              ? pctDelta(kpisCurr.fechadosCount, kpisPrev.fechadosCount)
              : null
          }
        />
        <KpiCard
          icon={Target}
          label="Taxa de conversão"
          value={`${conversaoPct}%`}
          hint="rolling 90d · novos → fechados"
        />
      </div>
    );
  });
}

async function FunilSection({
  filters,
  period,
}: {
  filters: RFilters;
  period: PeriodRange;
}) {
  return renderSection("Funil de conversão", async () => {
    const stages = await fetchConversionRates(filters, period);
    return <ConversionFunnel stages={stages} />;
  });
}

async function MqlSqlSection({
  filters,
  period,
  compPeriod,
}: {
  filters: RFilters;
  period: PeriodRange;
  compPeriod: PeriodRange | null;
}) {
  return renderSection("MQL / SQL", async () => {
    const [resumo, resumoPrev, porOrigem] = await Promise.all([
      fetchMqlSql(filters, period),
      compPeriod ? fetchMqlSql(filters, compPeriod) : Promise.resolve(null),
      fetchMqlSqlPorOrigem(filters, period),
    ]);
    return (
      <MqlSqlFunil
        resumo={resumo}
        resumoPrev={resumoPrev}
        porOrigem={porOrigem}
      />
    );
  });
}

async function VolumeSection({
  filters,
  period,
}: {
  filters: RFilters;
  period: PeriodRange;
}) {
  return renderSection("Volume por dia", async () => {
    const rows = await fetchVolumePorDia(filters, period);
    return (
      <VolumePorDiaChart
        rows={rows}
        initialCanal={filters.canal ?? undefined}
        initialExcluirDesq={filters.excluirDesq ?? false}
      />
    );
  });
}

async function PipelineOrigemSection({
  filters,
  period,
  hideFinancial,
}: {
  filters: RFilters;
  period: PeriodRange;
  hideFinancial: boolean;
}) {
  return renderSection("Pipeline e origens", async () => {
    const [pipeline, origemRoi] = await Promise.all([
      fetchPipelineAtivoPorStatus(filters),
      fetchOrigemROI(filters, period),
    ]);
    return (
      <div className="grid gap-4 lg:grid-cols-3 stagger [&>*]:animate-fade-up">
        <PipelineStatusChart rows={pipeline} hideValue={hideFinancial} />
        <div className="lg:col-span-2">
          <OrigemROITable rows={origemRoi} hideValor={hideFinancial} />
        </div>
      </div>
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

async function PerformanceConsultoresSection({
  filters,
  period,
}: {
  filters: RFilters;
  period: PeriodRange;
}) {
  return renderSection("Performance dos consultores", async () => {
    const rows = await fetchPerformanceConsultores(filters, period);
    if (rows.length === 0) return null;
    return <PerformanceConsultoresTable rows={rows} />;
  });
}

async function UfLossSection({
  filters,
  period,
  hideFinancial,
}: {
  filters: RFilters;
  period: PeriodRange;
  hideFinancial: boolean;
}) {
  return renderSection("UF e perdas", async () => {
    const [perfUf, lossReasons] = await Promise.all([
      fetchPerformancePorUf(filters, period),
      fetchLossReasons(filters, period),
    ]);
    return (
      <div className="grid gap-4 lg:grid-cols-2 stagger [&>*]:animate-fade-up">
        <PerformanceUfTable rows={perfUf} hideValor={hideFinancial} />
        <LossReasonsChart rows={lossReasons} />
      </div>
    );
  });
}

async function SaudeOperacionalSection({
  filters,
  period,
}: {
  filters: RFilters;
  period: PeriodRange;
}) {
  return renderSection("Saúde operacional", async () => {
    // fetchKpis aqui é o MESMO chamado por KpisSection — React.cache
    // (em queries.ts) deduplica dentro do mesmo render request.
    const [slaComp, esfriandoGlobal, tempoMedio, kpis] = await Promise.all([
      fetchSlaCompliance(filters, period),
      fetchEsfriandoGlobal(),
      fetchTempoMedioPorStatus(filters, period),
      fetchKpis(filters, period),
    ]);
    const conversaoTaxa = kpis.conversaoRolling90d.taxa;
    const conversaoPct = (conversaoTaxa * 100).toFixed(1);

    return (
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Saúde operacional
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sinais de atenção do dia-a-dia da operação.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            icon={Clock}
            label="SLA 1º contato"
            value={`${(slaComp.rate * 100).toFixed(0)}%`}
            hint={
              slaComp.totalAtribuidos > 0
                ? `${slaComp.dentroSla}/${slaComp.totalAtribuidos} dentro 30min · média ${slaComp.avgPrimeiroContatoMin?.toFixed(0) ?? "—"}min`
                : "sem leads atribuídos"
            }
            deltaPct={
              slaComp.totalAtribuidos > 0
                ? pointsDelta(slaComp.rate * 100, 80)
                : null
            }
          />
          <KpiCard
            icon={Snowflake}
            label="Pipeline esfriando"
            value={String(esfriandoGlobal.count)}
            hint="leads ativos sem interação manual há 3+ dias"
          />
          <KpiCard
            icon={Target}
            label="Funil saudável?"
            value={
              conversaoTaxa >= 0.15
                ? "Sim"
                : conversaoTaxa >= 0.05
                  ? "Atenção"
                  : "Crítico"
            }
            hint={`taxa ${conversaoPct}% · meta ≥ 15%`}
          />
        </div>

        <TempoMedioChart rows={tempoMedio} />
      </section>
    );
  });
}

