import { type LucideIcon } from "lucide-react";

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
  /** Quando "premium", aplica gradient gold (use para receita/comissão). */
  tone?: "default" | "premium";
  /** Delta em pp (ex: +12.4 ou -3.5). Mostra chip semântico. */
  deltaPct?: number | null;
  deltaLabel?: string;
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  deltaPct = null,
  deltaLabel,
}: Props) {
  const isPremium = tone === "premium";
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-shadow duration-base hover:shadow-elev-md",
      )}
      style={
        isPremium
          ? {
              backgroundImage:
                "radial-gradient(140% 140% at 100% 0%, color-mix(in oklch, var(--gold) 14%, transparent) 0%, transparent 60%)",
            }
          : {
              backgroundImage:
                "radial-gradient(140% 140% at 100% 0%, color-mix(in oklch, var(--primary) 8%, transparent) 0%, transparent 60%)",
            }
      }
    >
      <CardHeader className="pb-1.5">
        <CardTitle className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle flex items-center gap-2">
          {Icon && (
            <Icon
              className={cn("size-3.5", isPremium ? "text-gold-700 dark:text-gold-400" : "text-primary")}
              strokeWidth={1.75}
            />
          )}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="font-display tabular-nums text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-foreground break-words">
          {value}
        </p>
        <div className="flex items-center gap-2 text-xs">
          {deltaPct !== null && deltaPct !== undefined && Number.isFinite(deltaPct) && (
            <DeltaChip deltaPct={deltaPct} />
          )}
          {hint && (
            <span className="text-muted-foreground truncate">{hint}</span>
          )}
          {!hint && deltaLabel && (
            <span className="text-muted-foreground truncate">{deltaLabel}</span>
          )}
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
