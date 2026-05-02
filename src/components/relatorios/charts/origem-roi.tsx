import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { OrigemROIRow } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = {
  rows: OrigemROIRow[];
  hideValor?: boolean;
};

/**
 * Tabela ROI por origem — métrica chave de marketing.
 * Para cada origem: leads, win rate (% conversão de resolvidos), valor liberado total,
 * ticket médio buscado.
 */
export function OrigemROITable({ rows, hideValor }: Props) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Origens · performance</CardTitle>
        <CardDescription>
          {hideValor
            ? "Volume e taxa de conversão por canal."
            : "Volume, win rate e R$ liberado por canal — onde investir."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-8 text-center">
            Sem dados no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/8 text-left">
                  <Th>Origem</Th>
                  <Th align="right">Leads</Th>
                  <Th align="right">Resolvidos</Th>
                  <Th align="right">Fechados</Th>
                  <Th>Win rate</Th>
                  {!hideValor && <Th align="right">Liberado</Th>}
                  {!hideValor && <Th align="right">Ticket médio</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const winPct = Math.round(r.winRate * 100);
                  return (
                    <tr
                      key={r.origem}
                      className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                    >
                      <td className="px-2 py-2.5 font-medium">{r.origem}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                        {r.leadsCount}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {r.resolvidos}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                        {r.fechados}
                      </td>
                      <td className="px-2 py-2.5">
                        {r.resolvidos > 0 ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 flex-1 max-w-[80px] rounded-full bg-foreground/8 overflow-hidden"
                              role="progressbar"
                              aria-valuenow={winPct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full transition-[width] duration-base",
                                  winPct >= 50
                                    ? "bg-emerald-500"
                                    : winPct >= 25
                                      ? "bg-gold-500"
                                      : "bg-rose-500",
                                )}
                                style={{ width: `${winPct}%` }}
                              />
                            </div>
                            <span className="font-mono tabular-nums text-[12px] w-9 text-right">
                              {winPct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground font-mono text-xs">
                            —
                          </span>
                        )}
                      </td>
                      {!hideValor && (
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {r.totalLiberadoCentavos > 0
                            ? formatBrlShort(r.totalLiberadoCentavos)
                            : "—"}
                        </td>
                      )}
                      {!hideValor && (
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                          {r.avgValorBuscadoCentavos > 0
                            ? formatBrlShort(r.avgValorBuscadoCentavos)
                            : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
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
