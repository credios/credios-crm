import { Badge } from "@/components/ui/badge";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_CLASSNAMES: Record<string, string> = {
  novo: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  conversa_inicial: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30 dark:text-cyan-300",
  aguardando_resposta: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  aguardando_documentacao: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
  documentacao_enviada: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
  em_negociacao: "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300",
  fechado: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  perdido: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
  sem_resposta: "bg-zinc-500/15 text-zinc-700 border-zinc-500/30 dark:text-zinc-300",
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
