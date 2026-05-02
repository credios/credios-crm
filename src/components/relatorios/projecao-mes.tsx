import { TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { ProjecaoMes } from "@/lib/reports/queries";

type Props = { proj: ProjecaoMes };

export function ProjecaoMesCard({ proj }: Props) {
  const adicionalEsperado =
    proj.projetadoCentavos - proj.comissaoFechadaCentavos;
  const fechadoPct =
    proj.projetadoCentavos > 0
      ? (proj.comissaoFechadaCentavos / proj.projetadoCentavos) * 100
      : 0;

  return (
    <Card
      className="overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(140% 140% at 100% 0%, color-mix(in oklch, var(--gold) 22%, transparent) 0%, transparent 60%)",
      }}
    >
      <CardHeader>
        <CardTitle className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-subtle flex items-center gap-2">
          <TrendingUp
            className="size-3.5 text-gold-700 dark:text-gold-400"
            strokeWidth={1.75}
          />
          Projeção do mês
        </CardTitle>
        <CardDescription>
          Comissão fechada + esperado em em-negociação
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="font-display tabular-nums text-[44px] font-semibold tracking-[-0.025em] leading-none">
          {formatBrlShort(proj.projetadoCentavos)}
        </p>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Já fechado</span>
            <span className="font-mono tabular-nums">
              {formatBrlShort(proj.comissaoFechadaCentavos)} ·{" "}
              {fechadoPct.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-foreground/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-slow"
              style={{ width: `${fechadoPct}%` }}
            />
          </div>
        </div>

        <div className="space-y-1 pt-2 border-t text-xs">
          <Line
            label="Em negociação agora"
            value={`${proj.emNegociacaoCount} leads · ${formatBrlShort(proj.pipelineEmNegociacaoCentavos)}`}
          />
          <Line
            label="Comissão média (90d)"
            value={formatBrlShort(proj.comissaoMediaCentavos)}
          />
          <Line
            label="Win rate histórico"
            value={`${(proj.winRateHistorico * 100).toFixed(0)}%`}
          />
          <Line
            label="Esperado adicional"
            value={formatBrlShort(adicionalEsperado)}
            highlight
          />
        </div>

        <p className="font-serif italic text-[11px] text-muted-foreground leading-snug pt-1">
          Metodologia: leads em &ldquo;em negociação&rdquo; × comissão média ×
          win rate dos últimos 90d.
        </p>
      </CardContent>
    </Card>
  );
}

function Line({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          highlight
            ? "font-mono tabular-nums font-semibold text-gold-700 dark:text-gold-400"
            : "font-mono tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
