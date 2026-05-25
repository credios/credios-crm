import {
  AlertTriangle,
  Inbox,
  PhoneCall,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { formatBrlShort } from "@/lib/formatters/currency";
import type { MiniPlacar as MiniPlacarData } from "@/lib/minha-mesa/queries";
import { cn } from "@/lib/utils";

type Props = { data: MiniPlacarData };

export function MiniPlacar({ data }: Props) {
  return (
    <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
      <Cell
        icon={Inbox}
        label="Novos 24h"
        value={String(data.leadsNovosRecebidos24h)}
        tone={data.leadsNovosRecebidos24h > 0 ? "primary" : "neutral"}
      />
      <Cell
        icon={PhoneCall}
        label="Contatados hoje"
        value={String(data.leadsContatadosHoje)}
      />
      <Cell
        icon={AlertTriangle}
        label="SLA pendente"
        value={String(data.slaPendente)}
        tone={data.slaPendente > 0 ? "danger" : "neutral"}
      />
      <Cell
        icon={Wallet}
        label="Pipeline ativo"
        value={formatBrlShort(data.pipelineAtivoCentavos)}
      />
    </div>
  );
}

const TONES = {
  neutral: { bg: "bg-bg-subtle", icon: "text-muted-foreground" },
  primary: { bg: "bg-blue-500/10", icon: "text-blue-700 dark:text-blue-300" },
  success: {
    bg: "bg-emerald-500/10",
    icon: "text-emerald-700 dark:text-emerald-300",
  },
  danger: { bg: "bg-destructive/10", icon: "text-destructive" },
} as const;

function Cell({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <div className="surface-solid rounded-xl p-3 flex items-start gap-2.5">
      <div className={cn("rounded-md p-1.5 shrink-0", t.bg)}>
        <Icon className={cn("size-4", t.icon)} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.12em] font-mono text-fg-subtle truncate">
          {label}
        </div>
        <div className="font-display text-lg font-semibold tabular-nums leading-tight mt-0.5 truncate">
          {value}
        </div>
      </div>
    </div>
  );
}
