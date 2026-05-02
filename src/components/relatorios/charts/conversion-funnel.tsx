import { ChevronRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import type { ConversionStage } from "@/lib/reports/queries";
import { cn } from "@/lib/utils";

import { STATUS_COLOR } from "./theme";

type Props = {
  stages: ConversionStage[];
};

/**
 * Funnel Hubspot-style: barras horizontais escalonadas + taxa de conversão
 * entre cada par adjacente. Inclui o "drop-off" — quem deixa o pipeline.
 */
export function ConversionFunnel({ stages }: Props) {
  if (stages.length === 0) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Funil de conversão</CardTitle>
          <CardDescription>Sem dados no período.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Pega o "topo" pra normalizar a largura das barras
  const topReached = stages[0]!.reachedFrom;
  const overallRate =
    topReached > 0 ? stages[stages.length - 1]!.reachedTo / topReached : 0;

  // Monta lista flat de "estágios visíveis" (incluindo o último destino)
  const visualRows: Array<{
    status: string;
    reached: number;
    pctOfTop: number;
  }> = [];
  for (const s of stages) {
    visualRows.push({
      status: s.fromStatus,
      reached: s.reachedFrom,
      pctOfTop: topReached > 0 ? s.reachedFrom / topReached : 0,
    });
  }
  // último "to"
  const last = stages[stages.length - 1]!;
  visualRows.push({
    status: last.toStatus,
    reached: last.reachedTo,
    pctOfTop: topReached > 0 ? last.reachedTo / topReached : 0,
  });

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Funil de conversão</CardTitle>
        <CardDescription>
          {topReached > 0 ? (
            <>
              {topReached} leads no topo · taxa global{" "}
              <span className="font-mono font-medium text-foreground">
                {(overallRate * 100).toFixed(1)}%
              </span>
            </>
          ) : (
            "Sem leads no período."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {visualRows.map((row, idx) => {
            const color =
              STATUS_COLOR[row.status] ?? "var(--color-charcoal-400)";
            const widthPct = Math.max(row.pctOfTop * 100, 4);
            const conv = stages[idx - 1];
            return (
              <div key={row.status}>
                {conv && (
                  <div className="flex items-center gap-1.5 pl-2 py-1 text-[11px] text-muted-foreground">
                    <ChevronRight className="size-3" strokeWidth={1.75} />
                    <span className="font-mono tabular-nums">
                      {(conv.rate * 100).toFixed(1)}%
                    </span>{" "}
                    seguem para próximo stage
                    {conv.reachedFrom > conv.reachedTo && (
                      <span className="text-rose-600 dark:text-rose-300 font-mono">
                        · {conv.reachedFrom - conv.reachedTo} drop-off
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "relative flex h-9 items-center rounded-md transition-all duration-base ease-out-soft",
                    )}
                    style={{
                      width: `${widthPct}%`,
                      minWidth: "120px",
                      background: `color-mix(in oklch, ${color} 18%, transparent)`,
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    <span className="px-3 text-[13px] font-medium truncate">
                      {STATUS_LEAD_LABEL[row.status] ?? row.status}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums text-[13px] font-medium text-foreground shrink-0">
                    {row.reached}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
