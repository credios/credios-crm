import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { PipelineEmReaisRow } from "@/lib/reports/queries";

import { STATUS_COLOR } from "./charts/theme";

const STAGE_ORDER = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
];

type Props = { rows: PipelineEmReaisRow[] };

export function PipelineEmReais({ rows }: Props) {
  const map = new Map(rows.map((r) => [r.status, r]));
  const ordered = STAGE_ORDER.map(
    (s) => map.get(s) ?? { status: s, count: 0, totalCentavos: 0 },
  ).filter((r) => r.count > 0);

  const totalCentavos = ordered.reduce((s, r) => s + r.totalCentavos, 0);
  const totalCount = ordered.reduce((s, r) => s + r.count, 0);
  const maxCentavos = Math.max(...ordered.map((r) => r.totalCentavos), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline em R$</CardTitle>
        <CardDescription>
          {formatBrlShort(totalCentavos)} em {totalCount}{" "}
          {totalCount === 1 ? "lead ativo" : "leads ativos"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="font-serif italic text-sm text-muted-foreground py-8 text-center">
            Pipeline vazio.
          </p>
        ) : (
          <div className="space-y-2">
            {ordered.map((r) => {
              const widthPct = (r.totalCentavos / maxCentavos) * 100;
              const color = STATUS_COLOR[r.status] ?? "var(--color-charcoal-400)";
              return (
                <div key={r.status} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium truncate">
                      {STATUS_LEAD_LABEL[r.status] ?? r.status}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground shrink-0">
                      {r.count} · {formatBrlShort(r.totalCentavos)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-foreground/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-base"
                      style={{
                        width: `${widthPct}%`,
                        background: `linear-gradient(90deg, color-mix(in oklch, ${color} 50%, transparent), ${color})`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
