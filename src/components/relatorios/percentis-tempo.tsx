import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PercentilRow } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = { rows: PercentilRow[] };

function fmt(v: number | null, unidade: PercentilRow["unidade"]): string {
  if (v == null) return "—";
  if (unidade === "min") return `${Math.round(v)}min`;
  if (unidade === "horas") return `${v.toFixed(1)}h`;
  return `${Math.round(v)}d`;
}

/**
 * Tabela de percentis P25/P50/P75/P90 — substitui o gráfico complexo de "curva
 * de aproveitamento por tempo". Mais útil pra decidir SLA e ponto de
 * abandono de leads.
 */
export function PercentisTempo({ rows }: Props) {
  const empty = rows.every(
    (r) => r.p25 == null && r.p50 == null && r.p75 == null && r.p90 == null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Distribuição de tempo até cada milestone
        </CardTitle>
        <CardDescription>
          P25 = 25% chegam em até esse tempo · P90 = 90% chegam até aí (cauda)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="font-serif italic text-sm text-muted-foreground py-8 text-center">
            Sem dados suficientes no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/8 text-left">
                  <Th>Métrica</Th>
                  <Th align="right">P25</Th>
                  <Th align="right">Mediana</Th>
                  <Th align="right">P75</Th>
                  <Th align="right">P90</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.metrica}
                    className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                  >
                    <td className="px-2 py-2.5 font-medium">{r.metrica}</td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                      {fmt(r.p25, r.unidade)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums font-semibold">
                      {fmt(r.p50, r.unidade)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                      {fmt(r.p75, r.unidade)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums text-rose-700 dark:text-rose-300">
                      {fmt(r.p90, r.unidade)}
                    </td>
                  </tr>
                ))}
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
