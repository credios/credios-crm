import {
  ArrowDownUp,
  CheckCircle2,
  Mail,
  MessageCircle,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ConsultorSelect } from "@/components/consultores/consultor-select";
import { KpiCard } from "@/components/relatorios/kpi-card";
import { SaudeCards } from "@/components/relatorios/saude-cards";
import { Badge } from "@/components/ui/badge";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { formatBrlFromCents, formatBrlShort } from "@/lib/formatters/currency";
import { formatRelative } from "@/lib/formatters/date";
import { listLeadsAtivosByConsultor } from "@/lib/leads/list-leads-by-consultor";
import { periodFromFilters } from "@/lib/reports/period";
import {
  fetchConsultoresAtivos,
  fetchKpisConsultor,
  fetchSaudePipeline,
} from "@/lib/reports/queries";
import { reportFiltersSchema } from "@/lib/validators/report";

export const revalidate = 60;
export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConsultoresOverviewPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/sem-permissao");

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }
  const consultorId = flat.id ?? null;

  const consultores = await fetchConsultoresAtivos();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Users className="size-6 text-primary" strokeWidth={1.75} />
            Consultores
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Visão executiva do pipeline de cada consultor.
          </p>
        </div>
        <ConsultorSelect consultores={consultores} currentId={consultorId} />
      </div>

      {!consultorId ? (
        <div className="rounded-xl border border-dashed border-foreground/15 p-8 text-center space-y-2">
          <UserCheck
            className="mx-auto size-8 text-fg-faint"
            strokeWidth={1.5}
          />
          <p className="font-display text-base font-semibold">
            Escolha um consultor
          </p>
          <p className="font-serif italic text-sm text-muted-foreground">
            Selecione no dropdown acima pra ver o overview do pipeline dele.
          </p>
        </div>
      ) : (
        <ConsultorOverview
          consultorId={consultorId}
          consultorNome={
            consultores.find((c) => c.id === consultorId)?.nome ?? "—"
          }
        />
      )}
    </div>
  );
}

async function ConsultorOverview({
  consultorId,
  consultorNome,
}: {
  consultorId: string;
  consultorNome: string;
}) {
  // Período fixo "últimos 30 dias" pros KPIs (overview, não relatório custom).
  const filters = reportFiltersSchema.parse({ periodo: "30d" });
  const period = periodFromFilters(filters);

  const [kpis, saude, leadsAtivos] = await Promise.all([
    fetchKpisConsultor(consultorId, period),
    fetchSaudePipeline(consultorId),
    listLeadsAtivosByConsultor(consultorId),
  ]);

  const taxa = kpis.conversaoPeriodo.taxa;

  // Agrupa leads ativos por status pra mostrar mini-pipeline.
  const porStatus = new Map<string, typeof leadsAtivos>();
  for (const l of leadsAtivos) {
    const arr = porStatus.get(l.status) ?? [];
    arr.push(l);
    porStatus.set(l.status, arr);
  }
  const statusOrdenados = Array.from(porStatus.entries()).sort(
    ([a], [b]) => statusOrdem(a) - statusOrdem(b),
  );

  return (
    <div className="space-y-6">
      {/* Identificação */}
      <div className="surface-solid rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-semibold">{consultorNome}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-mono uppercase tracking-wider">
              últimos 30 dias
            </span>{" "}
            · pipeline atual ao vivo
          </p>
        </div>
        <Link
          href={`/meu-desempenho?consultor=${consultorId}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Ver desempenho completo →
        </Link>
      </div>

      {/* KPIs do consultor */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger [&>*]:animate-fade-up">
        <KpiCard
          icon={UserCheck}
          label="Atribuídos"
          value={String(kpis.atribuidosCount)}
          hint="nos últimos 30d"
        />
        <KpiCard
          icon={ArrowDownUp}
          label="Pipeline ativo"
          value={String(kpis.pipelineCount)}
          hint={`${formatBrlShort(kpis.pipelineValorCentavos)} buscado`}
        />
        <KpiCard
          icon={CheckCircle2}
          tone={kpis.fechadosCount > 0 ? "premium" : "default"}
          label="Fechamentos"
          value={String(kpis.fechadosCount)}
          hint={`${formatBrlShort(kpis.fechadosValorLiberadoCentavos)} liberado · ${formatBrlShort(kpis.fechadosComissaoCentavos)} comissão`}
        />
        <KpiCard
          icon={Target}
          label="Taxa de conversão"
          value={`${(taxa * 100).toFixed(1)}%`}
          hint="atribuídos → fechados"
        />
      </div>

      {/* Saúde do pipeline pessoal */}
      <SaudeCards
        esfriando={saude.esfriando}
        slaAtrasado={saude.slaAtrasado}
        aguardandoAcao={saude.aguardandoAcao}
        consultorId={consultorId}
      />

      {/* Pipeline ativo agrupado por status */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Pipeline ativo
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {leadsAtivos.length} lead{leadsAtivos.length === 1 ? "" : "s"} em
            atendimento, agrupado{leadsAtivos.length === 1 ? "" : "s"} por
            status.
          </p>
        </div>
        {leadsAtivos.length === 0 ? (
          <div className="surface-solid rounded-xl p-6 text-center">
            <p className="font-serif italic text-sm text-muted-foreground">
              Nenhum lead ativo no momento.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {statusOrdenados.map(([status, leads]) => {
              const total = leads.reduce(
                (s, l) => s + (l.valorCreditoCentavos ?? 0),
                0,
              );
              return (
                <div key={status} className="surface-solid rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="soft">
                        {STATUS_LEAD_LABEL[status] ?? status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {leads.length} lead{leads.length === 1 ? "" : "s"} ·{" "}
                        {formatBrlShort(total)}
                      </span>
                    </div>
                  </div>
                  <ul className="divide-y divide-foreground/5">
                    {leads.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/leads/${l.id}`}
                            prefetch={false}
                            className="font-medium hover:underline text-sm truncate block"
                          >
                            {l.nome}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <span>
                              {formatBrlFromCents(l.valorCreditoCentavos)}
                            </span>
                            {l.origem && (
                              <>
                                <span className="text-foreground/20">·</span>
                                <span>{l.origem}</span>
                              </>
                            )}
                            {(l.cidade || l.estado) && (
                              <>
                                <span className="text-foreground/20">·</span>
                                <span>
                                  {[l.cidade, l.estado]
                                    .filter(Boolean)
                                    .join("/")}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          <div>
                            <Mail className="inline size-3 mr-1 opacity-60" />
                            <span className="font-mono">
                              {l.ultimoContato
                                ? formatRelative(l.ultimoContato)
                                : "nunca"}
                            </span>
                          </div>
                          <div className="opacity-60 mt-0.5">
                            <MessageCircle className="inline size-3 mr-1" />
                            criado {formatRelative(l.createdAt)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// Ordem manual dos status do funil (mesma do Kanban).
const STATUS_ORDER = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
];
function statusOrdem(s: string): number {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 999 : i;
}
