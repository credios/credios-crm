import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PerformanceConsultorRow } from "@/lib/reports/queries";

export function PerformanceConsultoresTable({
  rows,
}: {
  rows: PerformanceConsultorRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Performance por consultor</CardTitle>
        <CardDescription>
          Leads atribuídos no período, taxa de fechamento e tempo médio até primeiro contato.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-8 text-center">
            Sem consultores ativos no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/8 text-left">
                  <th className="px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    Consultor
                  </th>
                  <th className="px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle text-right">
                    Atribuídos
                  </th>
                  <th className="px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle text-right">
                    Fechados
                  </th>
                  <th className="px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    Taxa
                  </th>
                  <th className="px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle text-right">
                    1º contato (min)
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const taxa =
                    r.leadsAtribuidos > 0 ? r.taxaFechamento : 0;
                  const taxaPct = Math.round(taxa * 100);
                  return (
                    <tr
                      key={r.consultorId}
                      className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                    >
                      <td className="px-2 py-2.5 font-medium">
                        {r.consultorNome}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                        {r.leadsAtribuidos}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                        {r.fechados}
                      </td>
                      <td className="px-2 py-2.5">
                        {r.leadsAtribuidos > 0 ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 flex-1 max-w-[80px] rounded-full bg-foreground/8 overflow-hidden"
                              role="progressbar"
                              aria-valuenow={taxaPct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            >
                              <div
                                className="h-full rounded-full bg-gold-500 transition-[width] duration-base"
                                style={{ width: `${taxaPct}%` }}
                              />
                            </div>
                            <span className="font-mono tabular-nums text-[12px] tabular-nums w-9 text-right">
                              {taxaPct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                        {r.primeiroContatoMinAvg != null
                          ? r.primeiroContatoMinAvg.toFixed(0)
                          : "—"}
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
