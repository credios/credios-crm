import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { TopOrigemRow } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

type Props = { rows: TopOrigemRow[] };

export function TopOrigens({ rows }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Top 10 origens detalhadas
        </CardTitle>
        <CardDescription>
          Granularidade de campanha (origem + UTM) — ordenado por R$ liberado
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="font-serif italic text-sm text-muted-foreground py-8 text-center">
            Sem dados no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/8 text-left">
                  <Th>Origem</Th>
                  <Th>UTM Source</Th>
                  <Th>Campanha</Th>
                  <Th align="right">Leads</Th>
                  <Th align="right">Fechados</Th>
                  <Th align="right">R$ liberado</Th>
                  <Th align="right">Taxa</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.origem}-${r.utmSource}-${r.utmCampaign}-${i}`}
                    className="border-b border-foreground/5 transition-colors hover:bg-foreground/3"
                  >
                    <td className="px-2 py-2.5 font-medium">{r.origem}</td>
                    <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.utmSource}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                      {r.utmCampaign}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                      {r.leads}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                      {r.fechados}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                      {r.totalLiberadoCentavos > 0
                        ? formatBrlShort(r.totalLiberadoCentavos)
                        : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                      {r.fechados > 0
                        ? `${(r.taxa * 100).toFixed(0)}%`
                        : "—"}
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
