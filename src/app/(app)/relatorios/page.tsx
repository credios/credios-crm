import {
  ArrowDownUp,
  CheckCircle2,
  TrendingUp,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

import { KpiCard } from "@/components/relatorios/kpi-card";
import { FunilChart } from "@/components/relatorios/charts/funil";
import { PerformanceConsultoresTable } from "@/components/relatorios/charts/performance-consultores";
import { PipelineStatusChart } from "@/components/relatorios/charts/pipeline-status";
import { ReceitaMensalChart } from "@/components/relatorios/charts/receita-mensal";
import { TempoMedioChart } from "@/components/relatorios/charts/tempo-medio";
import { VolumePorDiaChart } from "@/components/relatorios/charts/volume-por-dia";
import { ReportFilters } from "@/components/relatorios/report-filters";
import { getAppUser } from "@/lib/auth/get-app-user";
import { formatBrlShort } from "@/lib/formatters/currency";
import { periodFromFilters } from "@/lib/reports/period";
import {
  fetchConsultoresAtivos,
  fetchFunil,
  fetchKpis,
  fetchOrigensDistintas,
  fetchPerformanceConsultores,
  fetchPipelineAtivoPorStatus,
  fetchReceitaMensal,
  fetchTempoMedioPorStatus,
  fetchVolumePorDia,
} from "@/lib/reports/queries";
import { reportFiltersSchema } from "@/lib/validators/report";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RelatoriosPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }
  const filters = reportFiltersSchema.parse(flat);
  const period = periodFromFilters(filters);
  const isMarketing = user.perfil === "marketing";

  const [
    kpis,
    volume,
    funil,
    tempo,
    perf,
    pipeline,
    receita,
    consultores,
    origens,
  ] = await Promise.all([
    fetchKpis(filters, period),
    fetchVolumePorDia(filters, period),
    fetchFunil(filters, period),
    fetchTempoMedioPorStatus(filters, period),
    isMarketing ? Promise.resolve([]) : fetchPerformanceConsultores(filters, period),
    fetchPipelineAtivoPorStatus(filters),
    isMarketing ? Promise.resolve([]) : fetchReceitaMensal(filters),
    fetchConsultoresAtivos(),
    fetchOrigensDistintas(),
  ]);

  const conversaoPct = (kpis.conversaoRolling90d.taxa * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {period.label} · {isMarketing ? "Visão Marketing (sem dados financeiros)" : "Acesso completo"}
        </p>
      </div>

      <ReportFilters consultores={consultores} origens={origens} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Leads novos"
          value={String(kpis.leadsNovosCount)}
          hint={period.label.toLowerCase()}
        />
        <KpiCard
          icon={ArrowDownUp}
          label="Pipeline ativo"
          value={String(kpis.pipelineCount)}
          hint={
            isMarketing
              ? "leads em status não-terminal"
              : `${formatBrlShort(kpis.pipelineValorCentavos)} em valor buscado`
          }
        />
        <KpiCard
          icon={CheckCircle2}
          label="Fechados no período"
          value={String(kpis.fechadosCount)}
          hint={
            isMarketing
              ? "fechamentos no período"
              : `${formatBrlShort(kpis.fechadosValorLiberadoCentavos)} liberado · ${formatBrlShort(kpis.fechadosComissaoCentavos)} comissão`
          }
        />
        <KpiCard
          icon={TrendingUp}
          label="Conversão (90d)"
          value={`${conversaoPct}%`}
          hint={`${kpis.conversaoRolling90d.fechados} fechados / ${kpis.conversaoRolling90d.criados} criados`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VolumePorDiaChart rows={volume} />
        <FunilChart rows={funil} />
        <TempoMedioChart rows={tempo} />
        <PipelineStatusChart rows={pipeline} hideValue={isMarketing} />
        {!isMarketing && (
          <>
            <PerformanceConsultoresTable rows={perf} />
            <ReceitaMensalChart rows={receita} />
          </>
        )}
      </div>
    </div>
  );
}
