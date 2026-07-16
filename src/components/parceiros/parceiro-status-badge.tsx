import { Badge } from "@/components/ui/badge";
import {
  PARCEIRO_STATUS_LABEL,
  type ParceiroStatus,
} from "@/lib/parceiros/constants";
import { cn } from "@/lib/utils";

const CLASSES: Record<string, string> = {
  novo: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  em_contato:
    "bg-yellow-500/15 text-yellow-800 border-yellow-500/35 dark:text-yellow-200",
  reuniao: "bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300",
  proposta_enviada:
    "bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300",
  convidado_portal:
    "bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:text-indigo-300",
  ativo:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  perdido: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
};

export function ParceiroStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const label = PARCEIRO_STATUS_LABEL[status as ParceiroStatus] ?? status;
  return (
    <Badge
      variant="outline"
      className={cn(
        CLASSES[status] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {label}
    </Badge>
  );
}
