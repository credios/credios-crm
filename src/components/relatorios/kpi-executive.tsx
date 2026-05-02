import { type LucideIcon } from "lucide-react";

import { Sparkline } from "./sparkline";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  /** Quando "premium", aplica gradient gold; "growth" gradient blue. */
  tone?: "default" | "premium" | "growth";
  /** Delta em pp ou %. Mostra chip semântico abaixo do valor. */
  deltaPct?: number | null;
  /** Texto pequeno descrevendo a comparação ("vs período anterior"). */
  deltaLabel?: string;
  /** Sparkline opcional (últimos 6 períodos). */
  spark?: { valor: number }[];
  /** Cor da sparkline (default: primary). */
  sparkColor?: string;
};

/** KPI maior e mais executivo — fonte hero, sparkline e chip de delta. */
export function KpiExecutive({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  deltaPct = null,
  deltaLabel = "vs anterior",
  spark,
  sparkColor,
}: Props) {
  const isPremium = tone === "premium";
  const isGrowth = tone === "growth";

  return (
    <Card
      className="relative overflow-hidden transition-shadow duration-base hover:shadow-elev-md"
      style={{
        backgroundImage: isPremium
          ? "radial-gradient(140% 140% at 100% 0%, color-mix(in oklch, var(--gold) 18%, transparent) 0%, transparent 60%)"
          : isGrowth
            ? "radial-gradient(140% 140% at 100% 0%, color-mix(in oklch, #10b981 16%, transparent) 0%, transparent 60%)"
            : "radial-gradient(140% 140% at 100% 0%, color-mix(in oklch, var(--primary) 12%, transparent) 0%, transparent 60%)",
      }}
    >
      <CardHeader className="pb-1.5">
        <CardTitle className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-subtle flex items-center gap-2">
          {Icon && (
            <Icon
              className={cn(
                "size-3.5",
                isPremium
                  ? "text-gold-700 dark:text-gold-400"
                  : isGrowth
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-primary",
              )}
              strokeWidth={1.75}
            />
          )}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display tabular-nums text-[34px] font-semibold tracking-[-0.025em] leading-none text-foreground">
            {value}
          </p>
          {spark && spark.length >= 2 && (
            <Sparkline
              points={spark}
              width={72}
              height={26}
              color={
                sparkColor ??
                (isPremium ? "#d4a351" : isGrowth ? "#10b981" : "#4b7be5")
              }
            />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {deltaPct !== null && deltaPct !== undefined && Number.isFinite(deltaPct) && (
            <DeltaChip deltaPct={deltaPct} />
          )}
          <span className="text-muted-foreground truncate">
            {hint ?? deltaLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DeltaChip({ deltaPct }: { deltaPct: number }) {
  const positive = deltaPct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums",
        positive
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
      )}
    >
      <span aria-hidden>{positive ? "↑" : "↓"}</span>
      {Math.abs(deltaPct).toFixed(1)}%
    </span>
  );
}
