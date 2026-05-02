import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LossReasonRow } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = { rows: LossReasonRow[] };

/**
 * Tabela de motivos de perda (substituiu o donut — donut com poucos dados
 * fica ilegível e a tabela ordena por % do total, mais útil pra analisar).
 */
export function LossReasonsChart({ rows }: Props) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const sorted = [...rows].sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Motivos de perda</CardTitle>
        <CardDescription>
          {total > 0
            ? `${total} leads perdidos / desqualificados no período`
            : "Sem perdas no período."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="font-serif italic text-sm text-muted-foreground py-8 text-center">
            Boa notícia — nenhum lead foi perdido nem desqualificado.
          </p>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/8 text-left">
                  <th className="px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    Motivo
                  </th>
                  <th className="px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle text-right">
                    Qtd
                  </th>
                  <th className="px-2 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const pct = total > 0 ? r.count / total : 0;
                  const pctNum = Math.round(pct * 100);
                  return (
                    <tr
                      key={r.motivo}
                      className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                    >
                      <td className="px-2 py-2.5 font-medium">{r.motivo}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                        {r.count}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 flex-1 max-w-[140px] rounded-full bg-foreground/8 overflow-hidden"
                            role="progressbar"
                            aria-valuenow={pctNum}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width] duration-base",
                                pctNum >= 40
                                  ? "bg-rose-500"
                                  : pctNum >= 20
                                    ? "bg-gold-500"
                                    : "bg-charcoal-300",
                              )}
                              style={{ width: `${pctNum}%` }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-[12px] w-9 text-right">
                            {pctNum}%
                          </span>
                        </div>
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
