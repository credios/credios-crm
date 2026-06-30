import {
  ArrowDownUp,
  CheckCircle2,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { ConversionFunnel } from "@/components/relatorios/charts/conversion-funnel";
import { OrigemROITable } from "@/components/relatorios/charts/origem-roi";
import { VolumePorDiaChart } from "@/components/relatorios/charts/volume-por-dia";
import { ConsultorPicker } from "@/components/relatorios/consultor-picker";
import { DesempenhoFilters } from "@/components/relatorios/desempenho-filters";
import { HistoricoFechamentos } from "@/components/relatorios/historico-fechamentos";
import { KpiCard } from "@/components/relatorios/kpi-card";
import { SaudeCards } from "@/components/relatorios/saude-cards";
import { logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin, isAdminOrGerente } from "@/lib/auth/permissions";
import { formatBrlShort } from "@/lib/formatters/currency";
import { periodFromFilters } from "@/lib/reports/period";
import {
  comparisonPeriod,
  isComparisonReliable,
  pctDelta,
  pointsDelta,
} from "@/lib/reports/comparativos";
import {
  fetchConsultoresAtivos,
  fetchConversionRates,
  fetchHistoricoFechamentos,
  fetchKpisConsultor,
  fetchOrigemROI,
  fetchOrigensDistintas,
  fetchSaudePipeline,
  fetchVolumePorDia,
} from "@/lib/reports/queries";
import { reportFiltersSchema } from "@/lib/validators/report";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MeuDesempenhoPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }

  // Resolve consultor visualizado: admin/gerente podem ver outro, demais sempre veem o próprio.
  const podeVerOutros = isAdminOrGerente(user);
  const requestedId = flat.consultor;
  const consultorVisualizadoId =
    podeVerOutros && requestedId ? requestedId : user.id;

  // Filtros sempre escopados pelo consultor visualizado — server-side, não confiando em UI.
  const filters = reportFiltersSchema.parse({
    ...flat,
    // Força consultorIds = [consultorVisualizadoId]
    consultorIds: consultorVisualizadoId,
    // Reseta single legacy pra não duplicar no normalize.
    consultorId: undefined,
  });
  const period = periodFromFilters(filters);
  const compPeriod = comparisonPeriod(period, "anterior_equivalente");

  const consultores = podeVerOutros ? await fetchConsultoresAtivos() : [];
  const consultorVisualizado =
    consultores.find((c) => c.id === consultorVisualizadoId) ??
    (consultorVisualizadoId === user.id
      ? { id: user.id, nome: user.nome }
      : { id: consultorVisualizadoId, nome: "Consultor" });

  const canSeeFinancial = isAdmin(user);
  const hideValor = !canSeeFinancial;

  const [
    kpisCurr,
    kpisPrev,
    conversionRates,
    volume,
    origemRoi,
    saude,
    historico,
  ] = await Promise.all([
    // Métrica correta pra "meu desempenho": conta leads ATRIBUÍDOS no período,
    // não criados. Um lead criado no mês passado mas atribuído essa semana
    // pertence ao desempenho desta semana.
    fetchKpisConsultor(consultorVisualizadoId, period),
    compPeriod
      ? fetchKpisConsultor(consultorVisualizadoId, compPeriod)
      : Promise.resolve(null),
    fetchConversionRates(filters, period),
    fetchVolumePorDia(filters, period),
    fetchOrigemROI(filters, period),
    fetchSaudePipeline(consultorVisualizadoId),
    canSeeFinancial
      ? fetchHistoricoFechamentos(consultorVisualizadoId, period)
      : Promise.resolve([]),
  ]);

  // Taxa local ao período: fechados / atribuídos no MESMO período (não rolling).
  const taxaCurr = kpisCurr.conversaoPeriodo.taxa;
  const taxaPrev = kpisPrev?.conversaoPeriodo.taxa ?? 0;

  // Esconde deltas quando a janela de comparação não tem volume suficiente
  // pra ser confiável (períodos longos caem antes da operação existir e o %
  // explode — ex.: +17300%). Ver isComparisonReliable.
  const comparavel = isComparisonReliable(kpisPrev?.atribuidosCount);

  // Audit não-crítico via after — não bloqueia render e não é cortado em serverless.
  after(() =>
    logAction(
      null,
      user.id,
      "relatorio_acessado",
      "relatorio",
      null,
      {
        tipo: "meu_desempenho",
        consultor_visualizado: consultorVisualizadoId,
        periodo: period.preset,
      },
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
            Meu desempenho
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {consultorVisualizado.nome}
            </span>{" "}
            ·{" "}
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
              {period.label}
            </span>
          </p>
        </div>
        {podeVerOutros && consultores.length > 0 && (
          <ConsultorPicker
            consultores={consultores}
            currentId={consultorVisualizadoId}
            selfId={user.id}
          />
        )}
      </div>

      <DesempenhoFilters origens={await fetchOrigensDistintas()} />

      {/* KPIs — 4 cards com comparativo */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger [&>*]:animate-fade-up">
        <KpiCard
          icon={Users}
          label="Atribuídos"
          value={String(kpisCurr.atribuidosCount)}
          hint="atribuídos no período"
          deltaPct={
            comparavel && kpisPrev
              ? pctDelta(kpisCurr.atribuidosCount, kpisPrev.atribuidosCount)
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
          tone={canSeeFinancial && kpisCurr.fechadosCount > 0 ? "premium" : "default"}
          label="Fechamentos"
          value={String(kpisCurr.fechadosCount)}
          hint={
            canSeeFinancial
              ? `${formatBrlShort(kpisCurr.fechadosValorLiberadoCentavos)} liberado · ${formatBrlShort(kpisCurr.fechadosComissaoCentavos)} comissão`
              : "no período"
          }
          deltaPct={
            comparavel && kpisPrev
              ? pctDelta(kpisCurr.fechadosCount, kpisPrev.fechadosCount)
              : null
          }
        />
        <KpiCard
          icon={Target}
          label="Taxa de conversão"
          value={`${(taxaCurr * 100).toFixed(1)}%`}
          hint="atribuídos → fechados no período"
          deltaPct={
            comparavel ? pointsDelta(taxaCurr * 100, taxaPrev * 100) : null
          }
        />
      </div>

      {/* Saúde do pipeline pessoal */}
      <SaudeCards
        esfriando={saude.esfriando}
        slaAtrasado={saude.slaAtrasado}
        aguardandoAcao={saude.aguardandoAcao}
        consultorId={consultorVisualizadoId}
      />

      {/* Funil pessoal */}
      <ConversionFunnel stages={conversionRates} />

      {/* Volume por dia */}
      <VolumePorDiaChart rows={volume} />

      {/* Performance por origem */}
      <OrigemROITable rows={origemRoi} hideValor={hideValor} />

      {/* Histórico de fechamentos (só admin vê valores) */}
      {historico.length > 0 && (
        <HistoricoFechamentos rows={historico} hideValor={hideValor} />
      )}

      {/* Estado vazio */}
      {kpisCurr.atribuidosCount === 0 &&
        kpisCurr.pipelineCount === 0 &&
        historico.length === 0 && (
          <div className="rounded-xl border border-dashed border-foreground/15 p-8 text-center">
            <TrendingUp
              className="mx-auto size-8 text-fg-faint"
              strokeWidth={1.5}
            />
            <p className="mt-2 font-display text-base font-semibold">
              Sem atividade no período
            </p>
            <p className="mt-1 font-serif italic text-sm text-muted-foreground">
              {consultorVisualizadoId === user.id
                ? "Você ainda não recebeu leads no período selecionado."
                : `${consultorVisualizado.nome} não recebeu leads no período selecionado.`}
            </p>
          </div>
        )}
    </div>
  );
}
