import {
  ArrowDownUp,
  CheckCircle2,
  Clock,
  Snowflake,
  Target,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { after } from "next/server";

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
import { periodFromFilters } from "@/lib/reports/period";
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
import { reportFiltersSchema } from "@/lib/validators/report";

export const dynamic = "force-dynamic";
export const revalidate = 60;

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

  const [
    kpisCurr,
    kpisPrev,
    conversionRates,
    volume,
    origemRoi,
    perfUf,
    perfConsultores,
    pipeline,
    lossReasons,
    slaComp,
    tempoMedio,
    consultores,
    origens,
    ufs,
    distrib,
    esfriandoGlobal,
    tarefasStats,
  ] = await Promise.all([
    fetchKpis(filters, period),
    compPeriod ? fetchKpis(filters, compPeriod) : Promise.resolve(null),
    fetchConversionRates(filters, period),
    fetchVolumePorDia(filters, period),
    fetchOrigemROI(filters, period),
    fetchPerformancePorUf(filters, period),
    isAdminGerente
      ? fetchPerformanceConsultores(filters, period)
      : Promise.resolve([]),
    fetchPipelineAtivoPorStatus(filters),
    fetchLossReasons(filters, period),
    fetchSlaCompliance(filters, period),
    fetchTempoMedioPorStatus(filters, period),
    fetchConsultoresAtivos(),
    fetchOrigensDistintas(),
    fetchUfsDistintas(),
    fetchDistribuicoes(filters, period),
    fetchEsfriandoGlobal(),
    isAdminGerente ? taskStatsByConsultor() : Promise.resolve([]),
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

      {/* Funil global */}
      <ConversionFunnel stages={conversionRates} />

      {/* Volume por dia (área empilhada por origem) */}
      <VolumePorDiaChart rows={volume} />

      {/* Mix de origens — donut + tabela */}
      <div className="grid gap-4 lg:grid-cols-3 stagger [&>*]:animate-fade-up">
        <PipelineStatusChart rows={pipeline} hideValue={hideFinancial} />
        <div className="lg:col-span-2">
          <OrigemROITable rows={origemRoi} hideValor={hideFinancial} />
        </div>
      </div>

      {/* Perfil dos leads — distribuições agregadas */}
      <DistribuicaoCards data={distrib} />

      {/* Performance por consultor — admin/gerente only */}
      {isAdminGerente && perfConsultores.length > 0 && (
        <PerformanceConsultoresTable rows={perfConsultores} />
      )}

      {/* Performance por estado + motivos de perda */}
      <div className="grid gap-4 lg:grid-cols-2 stagger [&>*]:animate-fade-up">
        <PerformanceUfTable rows={perfUf} hideValor={hideFinancial} />
        <LossReasonsChart rows={lossReasons} />
      </div>

      {/* === Saúde Operacional (seção dedicada) === */}
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
                ? pointsDelta(slaComp.rate * 100, 80) // alvo 80%
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
              kpisCurr.conversaoRolling90d.taxa >= 0.15
                ? "Sim"
                : kpisCurr.conversaoRolling90d.taxa >= 0.05
                  ? "Atenção"
                  : "Crítico"
            }
            hint={`taxa ${conversaoPct}% · meta ≥ 15%`}
          />
        </div>

        <TempoMedioChart rows={tempoMedio} />
      </section>

      {isAdminGerente && tarefasStats.length > 0 && (
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
                        <td className="px-3 py-2 text-right text-destructive">{s.atrasadas}</td>
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
      )}
    </div>
  );
}
