import { Check } from "lucide-react";

import {
  ETAPA_META,
  ETAPAS_FUNIL,
  etapaEncerrada,
  type Etapa,
} from "@/lib/portal-parceiro/status";
import { cn } from "@/lib/utils";

const TOM: Record<string, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  alerta:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  sucesso:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  neutro: "border-border bg-muted text-muted-foreground",
};

export function EtapaBadge({ etapa }: { etapa: Etapa }) {
  const meta = ETAPA_META[etapa];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TOM[meta.tom],
      )}
    >
      {meta.label}
    </span>
  );
}

/** Progresso no caminho feliz. Em etapa de encerramento sem liberação, some. */
export function EtapaProgresso({ etapa }: { etapa: Etapa }) {
  if (etapaEncerrada(etapa) && etapa !== "liberada") return null;
  const atual = ETAPAS_FUNIL.indexOf(etapa);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3">
      {ETAPAS_FUNIL.map((e, i) => {
        const feito = i < atual || etapa === "liberada";
        const ativo = i === atual && etapa !== "liberada";
        return (
          <li key={e} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                feito && "border-emerald-600 bg-emerald-600 text-white",
                ativo && "border-primary bg-primary text-primary-foreground",
                !feito && !ativo && "border-border text-muted-foreground",
              )}
            >
              {feito ? <Check className="size-3" aria-hidden /> : i + 1}
            </span>
            <span className={cn(ativo ? "font-medium" : "text-muted-foreground")}>
              {ETAPA_META[e].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
