import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBrlShort } from "@/lib/formatters/currency";
import { pctDelta } from "@/lib/reports/comparativos";
import type { ComparativoRow } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = {
  rows: ComparativoRow[];
  /** Label do período de comparação ("Período anterior" / "Ano passado"). */
  comparisonLabel: string;
};

function formatValue(v: number, formato: ComparativoRow["formato"]): string {
  switch (formato) {
    case "centavos":
      return formatBrlShort(v);
    case "pct":
      return `${v.toFixed(1)}%`;
    case "dias":
      return `${Math.round(v)}d`;
    case "numero":
      return new Intl.NumberFormat("pt-BR").format(v);
  }
}

export function ComparativoPeriodos({ rows, comparisonLabel }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comparativo de períodos</CardTitle>
        <CardDescription>
          Atual vs <span className="font-medium">{comparisonLabel}</span> · variação
          em verde melhorou, vermelho piorou (estável: ±2%)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/8 text-left">
                <Th>Métrica</Th>
                <Th align="right">Atual</Th>
                <Th align="right">{comparisonLabel}</Th>
                <Th align="right">Δ%</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delta = pctDelta(r.atual, r.anterior);
                const tone =
                  delta == null
                    ? "neutral"
                    : Math.abs(delta) < 2
                      ? "neutral"
                      : delta > 0
                        ? "up"
                        : "down";
                const Icon =
                  tone === "up"
                    ? ArrowUpRight
                    : tone === "down"
                      ? ArrowDownRight
                      : ArrowRight;
                return (
                  <tr
                    key={r.metrica}
                    className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                  >
                    <td className="px-2 py-2.5 font-medium">{r.metrica}</td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                      {formatValue(r.atual, r.formato)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {formatValue(r.anterior, r.formato)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2.5 text-right font-mono tabular-nums",
                        tone === "up" && "text-emerald-700 dark:text-emerald-300",
                        tone === "down" && "text-rose-700 dark:text-rose-300",
                        tone === "neutral" && "text-muted-foreground",
                      )}
                    >
                      {delta == null
                        ? "—"
                        : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-2.5">
                      <Icon
                        className={cn(
                          "size-4",
                          tone === "up" && "text-emerald-600",
                          tone === "down" && "text-rose-600",
                          tone === "neutral" && "text-muted-foreground",
                        )}
                        strokeWidth={1.75}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  align,
}: {
  children?: React.ReactNode;
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
