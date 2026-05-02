import { Badge } from "@/components/ui/badge";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_CLASSNAMES: Record<string, string> = {
  novo: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  conversa_inicial:
    "bg-blue-300/20 text-blue-700 border-blue-300/40 dark:text-blue-200",
  aguardando_resposta:
    "bg-gold-500/18 text-gold-800 border-gold-500/35 dark:text-gold-200",
  aguardando_documentacao:
    "bg-gold-600/15 text-gold-900 border-gold-600/30 dark:text-gold-300",
  documentacao_enviada:
    "bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
  em_negociacao:
    "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300",
  fechado:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  perdido: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
  sem_resposta:
    "bg-charcoal-300/20 text-charcoal-700 border-charcoal-300/40 dark:bg-charcoal-200/15 dark:text-charcoal-100",
  desqualificado: "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-300",
};

type Props = {
  status: string;
  className?: string;
};

export function StatusBadge({ status, className }: Props) {
  const label = STATUS_LEAD_LABEL[status] ?? status;
  const cls = STATUS_CLASSNAMES[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cn(cls, className)}>
      {label}
    </Badge>
  );
}

export function statusBadgeColor(status: string): string {
  return STATUS_CLASSNAMES[status] ?? "bg-muted text-muted-foreground border-border";
}
