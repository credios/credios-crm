import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { PerformanceUfRow } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = {
  rows: PerformanceUfRow[];
  /** Marketing oculta R$ liberado. */
  hideValor?: boolean;
};

export function PerformanceUfTable({ rows, hideValor }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Performance por estado</CardTitle>
        <CardDescription>
          Distribuição geográfica · ordenado por volume de leads
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
                  <Th>UF</Th>
                  <Th align="right">Leads</Th>
                  <Th align="right">Em pipeline</Th>
                  <Th align="right">R$ buscado</Th>
                  {!hideValor && <Th align="right">R$ liberado</Th>}
                  <Th align="right">Conversão</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = Math.round(r.taxaConversao * 100);
                  return (
                    <tr
                      key={r.uf}
                      className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                    >
                      <td className="px-2 py-2 font-medium font-mono">
                        {r.uf}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {r.leadsCount}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {r.pipelineCount}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {formatBrlShort(r.totalBuscadoCentavos)}
                      </td>
                      {!hideValor && (
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {r.totalLiberadoCentavos > 0
                            ? formatBrlShort(r.totalLiberadoCentavos)
                            : "—"}
                        </td>
                      )}
                      <td
                        className={cn(
                          "px-2 py-2 text-right font-mono tabular-nums",
                          pct >= 30
                            ? "text-emerald-700 dark:text-emerald-300"
                            : pct >= 10
                              ? "text-gold-700 dark:text-gold-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {r.fechados > 0 ? `${pct}%` : "—"}
                      </td>
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
