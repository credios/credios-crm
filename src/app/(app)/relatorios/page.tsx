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
import { taskStatsByConsultor } from "@/lib/tasks/service";
import {
  reportFiltersSchema,
  type ReportFilters as RFilters,
} from "@/lib/validators/report";

// `force-dynamic` removido: a página já é dinâmica por usar cookies (auth)
// e searchParams. Sem ele, o Next aplica o `revalidate = 60` ao Data Cache
// dos fetches/queries cacheados (ver unstable_cache em queries.ts).
export const revalidate = 60;
export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ReportKpis = Awaited<ReturnType<typeof fetchKpis>>;

const EMPTY_KPIS: ReportKpis = {
  leadsNovosCount: 0,
  pipelineCount: 0,
  pipelineValorCentavos: 0,
  fechadosCount: 0,
  fechadosValorLiberadoCentavos: 0,
  fechadosComissaoCentavos: 0,
  conversaoRolling90d: { criados: 0, fechados: 0, taxa: 0 },
};

async function safeQuery<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error(`[/relatorios:${label}]`, error);
    return fallback;
  }
}

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

  // === Tier 1 (síncrono, render imediato) =====================================
  // Auth + KPIs essenciais + dados pros filtros. Tudo o que precisa estar
  // visível antes do streaming kickar. Mantido ENXUTO de propósito — qualquer
  // query nova pesada vai pra um Suspense abaixo.
  const [kpisCurr, kpisPrev, consultores, origens, ufs] = await Promise.all([
    safeQuery("kpis-current", fetchKpis(filters, period), EMPTY_KPIS),
    compPeriod
      ? safeQuery<ReportKpis | null>(
          "kpis-previous",
          fetchKpis(filters, compPeriod),
          null,
        )
      : Promise.resolve(null),
    safeQuery("consultores", fetchConsultoresAtivos(), []),
    safeQuery("origens", fetchOrigensDistintas(), []),
    safeQuery("ufs", fetchUfsDistintas(), []),
  ]);

  const conversaoPct = (kpisCurr.conversaoRolling90d.taxa * 100).toFixed(1);

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

      <ReportFilters
        consultores={consultores}
        origens={origens}
        ufs={ufs}
        hideFaixaValor={isMarketing}
      />

      {/* KPIs operacionais — 4 cards limpos */}
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

      {/* === Tier 2 (streaming) — cada Suspense renderiza independente. ===
          Uma query lenta/falha numa seção não derruba a página inteira;
          enquanto resolve, o usuário vê o skeleton da seção e o resto da
          página já interativa. */}

      <Suspense fallback={<SectionSkeleton h={320} />}>
        <FunilSection filters={filters} period={period} />
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
        <SaudeOperacionalSection
          filters={filters}
          period={period}
          conversaoTaxa={kpisCurr.conversaoRolling90d.taxa}
          conversaoPct={conversaoPct}
        />
      </Suspense>

      {isAdminGerente && (
        <Suspense fallback={<SectionSkeleton h={250} />}>
          <TarefasSection />
        </Suspense>
      )}
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

async function renderSection(
  name: string,
  fn: () => Promise<ReactNode>,
): Promise<ReactNode> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[/relatorios:${name}]`, error);
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
            Esta seção falhou ao carregar, mas o restante do relatório continua
            disponível. Recarregue a página para tentar novamente.
          </p>
        </div>
      </div>
    </div>
  );
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

async function VolumeSection({
  filters,
  period,
}: {
  filters: RFilters;
  period: PeriodRange;
}) {
  return renderSection("Volume por dia", async () => {
    const rows = await fetchVolumePorDia(filters, period);
    return <VolumePorDiaChart rows={rows} />;
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
  conversaoTaxa,
  conversaoPct,
}: {
  filters: RFilters;
  period: PeriodRange;
  conversaoTaxa: number;
  conversaoPct: string;
}) {
  return renderSection("Saúde operacional", async () => {
    const [slaComp, esfriandoGlobal, tempoMedio] = await Promise.all([
      fetchSlaCompliance(filters, period),
      fetchEsfriandoGlobal(),
      fetchTempoMedioPorStatus(filters, period),
    ]);

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

async function TarefasSection() {
  return renderSection("Gestão de tarefas", async () => {
    const tarefasStats = await taskStatsByConsultor();
    if (tarefasStats.length === 0) return null;

    return (
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Gestão de tarefas
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Conclusão e atrasos operacionais por consultor.
          </p>
        </div>
        <div className="surface-solid rounded-xl overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="border-b bg-bg-subtle">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Consultor</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Abertas</th>
                <th className="px-3 py-2 text-right">Atrasadas</th>
                <th className="px-3 py-2 text-right">Concluídas</th>
                <th className="px-3 py-2 text-right">Taxa conclusão</th>
              </tr>
            </thead>
            <tbody>
              {tarefasStats.map((s) => {
                const taxa = s.total > 0 ? (s.concluidas / s.total) * 100 : 0;
                return (
                  <tr key={s.consultorId} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{s.consultorNome}</td>
                    <td className="px-3 py-2 text-right">{s.total}</td>
                    <td className="px-3 py-2 text-right">{s.abertas}</td>
                    <td className="px-3 py-2 text-right text-destructive">
                      {s.atrasadas}
                    </td>
                    <td className="px-3 py-2 text-right">{s.concluidas}</td>
                    <td className="px-3 py-2 text-right">{taxa.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  });
}
