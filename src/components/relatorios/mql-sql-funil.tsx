import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MqlSqlOrigemRow, MqlSqlResumo } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = {
  resumo: MqlSqlResumo;
  resumoPrev: MqlSqlResumo | null;
  porOrigem: MqlSqlOrigemRow[];
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Funil de qualificação MQL → SQL.
 *   MQL = lead atribuído a um consultor (minimamente qualificado no recebimento).
 *   SQL = MQL que o comercial não desqualificou (oportunidade aceita).
 * Separa qualidade do lead (aceite SQL/MQL) da eficiência de vendas (win Fechado/SQL).
 */
export function MqlSqlFunil({ resumo, resumoPrev, porOrigem }: Props) {
  const { leads, mql, sql, desqualificados, fechados } = resumo;
  const mqlRate = leads > 0 ? mql / leads : 0;
  const aceite = mql > 0 ? sql / mql : 0; // qualidade do lead
  const winRate = sql > 0 ? fechados / sql : 0; // eficiência de vendas
  const desqRate = mql > 0 ? desqualificados / mql : 0;

  const aceitePrev =
    resumoPrev && resumoPrev.mql > 0 ? resumoPrev.sql / resumoPrev.mql : null;
  const winPrev =
    resumoPrev && resumoPrev.sql > 0 ? resumoPrev.fechados / resumoPrev.sql : null;
  const aceiteDelta = aceitePrev != null ? (aceite - aceitePrev) * 100 : null;
  const winDelta = winPrev != null ? (winRate - winPrev) * 100 : null;

  const etapas = [
    { label: "Recebidos", n: leads, sub: "entradas no período", conv: null as number | null },
    { label: "MQL", n: mql, sub: "atribuídos a consultor", conv: mqlRate },
    { label: "SQL", n: sql, sub: "aceitos pelo comercial", conv: aceite },
    { label: "Fechado", n: fechados, sub: "ganhos", conv: winRate },
  ];
  const maxN = Math.max(leads, 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Funil de qualificação · MQL → SQL</CardTitle>
        <CardDescription>
          MQL = atribuído a um consultor · SQL = aceito pelo comercial (não
          desqualificado, podendo estar em andamento, perdido ou fechado). Cohort
          por data de entrada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Funil */}
        <div className="space-y-2">
          {etapas.map((e, i) => (
            <div key={e.label} className="flex items-center gap-3">
              <div className="w-[68px] shrink-0 text-right text-[13px] font-semibold">
                {e.label}
              </div>
              <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-foreground/5">
                <div
                  className={cn(
                    "h-full rounded-lg transition-[width] duration-base",
                    i === 3 ? "bg-emerald-500/40" : "bg-credios-blue/40",
                  )}
                  style={{ width: `${Math.max((e.n / maxN) * 100, 1.5)}%` }}
                />
                <div className="absolute inset-0 flex items-center gap-2 px-3">
                  <span className="font-mono text-[13px] font-semibold tabular-nums">
                    {e.n.toLocaleString("pt-BR")}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {e.sub}
                  </span>
                </div>
              </div>
              <div className="w-12 shrink-0 text-right font-mono text-[12px] tabular-nums text-fg-subtle">
                {e.conv != null ? pct(e.conv) : "—"}
              </div>
            </div>
          ))}
          <p className="pl-[80px] text-[11px] text-fg-subtle">
            % à direita = conversão da etapa anterior.
          </p>
        </div>

        {/* Taxas-chave */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Aceite comercial"
            value={pct1(aceite)}
            sub="SQL ÷ MQL · qualidade do lead"
            delta={aceiteDelta}
            good="up"
          />
          <Stat
            label="Win rate"
            value={pct1(winRate)}
            sub="Fechado ÷ SQL · eficiência de vendas"
            delta={winDelta}
            good="up"
          />
          <Stat
            label="Desqualificação"
            value={pct1(desqRate)}
            sub={`${desqualificados} de ${mql} MQL`}
            delta={null}
            good="down"
          />
        </div>

        {/* Qualidade por origem */}
        <div>
          <h3 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            Qualidade por origem
          </h3>
          {porOrigem.length === 0 ? (
            <p className="py-6 text-center text-sm italic text-muted-foreground">
              Sem dados no período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/8 text-left">
                    <Th>Origem</Th>
                    <Th align="right">Leads</Th>
                    <Th align="right">MQL</Th>
                    <Th align="right">SQL</Th>
                    <Th>Aceite</Th>
                    <Th align="right">Fechados</Th>
                    <Th align="right">Win</Th>
                  </tr>
                </thead>
                <tbody>
                  {porOrigem.map((r) => {
                    const aceitePct = Math.round(r.taxaAceite * 100);
                    return (
                      <tr
                        key={r.origem}
                        className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                      >
                        <td className="px-2 py-2.5 font-medium">{r.origem}</td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {r.leads}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                          {r.mql}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {r.sql}
                        </td>
                        <td className="px-2 py-2.5">
                          {r.mql > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 max-w-[72px] flex-1 overflow-hidden rounded-full bg-foreground/8">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-[width] duration-base",
                                    aceitePct >= 75
                                      ? "bg-emerald-500"
                                      : aceitePct >= 50
                                        ? "bg-gold-500"
                                        : "bg-rose-500",
                                  )}
                                  style={{ width: `${aceitePct}%` }}
                                />
                              </div>
                              <span className="w-9 text-right font-mono text-[12px] tabular-nums">
                                {aceitePct}%
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {r.fechados}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                          {r.sql > 0 ? `${Math.round(r.winRate * 100)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  delta,
  good,
}: {
  label: string;
  value: string;
  sub: string;
  delta: number | null;
  good: "up" | "down";
}) {
  const positive = delta != null && delta > 0;
  const negative = delta != null && delta < 0;
  const isGood = (good === "up" && positive) || (good === "down" && negative);
  const isBad = (good === "up" && negative) || (good === "down" && positive);
  return (
    <div className="rounded-xl border border-foreground/8 bg-foreground/[0.02] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        {delta != null && Math.abs(delta) >= 0.1 && (
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              isGood
                ? "text-emerald-600"
                : isBad
                  ? "text-rose-600"
                  : "text-fg-subtle",
            )}
          >
            {positive ? "+" : ""}
            {delta.toFixed(1)} pts
          </span>
        )}
      </div>
      <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-fg-subtle">{sub}</div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={cn(
        "px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}
