"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { QuickActionsToolbar } from "./quick-actions-toolbar";
import { StatusBadge } from "@/components/leads/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import type { FilaItem, FilaItemTipo } from "@/lib/minha-mesa/queries";
import { cn } from "@/lib/utils";

type Props = {
  item: FilaItem;
  /** Chamado quando o user agiu em cima — card some otimisticamente. */
  onResolved: () => void;
};

const MOTIVO_TONE: Record<
  FilaItemTipo,
  { border: string; pill: "danger" | "warning" | "info" | "secondary" }
> = {
  sla_estourado: { border: "border-l-destructive", pill: "danger" },
  tarefa_atrasada: { border: "border-l-destructive", pill: "danger" },
  novo_hoje: { border: "border-l-blue-500", pill: "info" },
  docs_paradas: { border: "border-l-amber-500", pill: "warning" },
  negociacao_parada: { border: "border-l-amber-500", pill: "warning" },
  esfriando: { border: "border-l-amber-500", pill: "warning" },
  alto_valor_parado: { border: "border-l-violet-500", pill: "secondary" },
};

const PILL_VARIANT: Record<
  "danger" | "warning" | "info" | "secondary",
  "destructive" | "soft-gold" | "soft" | "outline"
> = {
  danger: "destructive",
  warning: "soft-gold",
  info: "soft",
  secondary: "outline",
};

function formatLocalizacao(
  cidade: string | null,
  estado: string | null,
): string {
  if (cidade && estado) return `${cidade}, ${estado}`;
  return cidade ?? estado ?? "";
}

export function CardFazerAgora({ item, onResolved }: Props) {
  const tone = MOTIVO_TONE[item.motivoTipo];

  return (
    <article
      className={cn(
        "surface-solid rounded-xl border-l-4 p-4 transition-shadow hover:shadow-sm",
        tone.border,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/leads/${item.leadId}`}
              prefetch={false}
              className="font-display text-base font-semibold leading-tight tracking-[-0.01em] hover:underline truncate"
            >
              {item.leadNome}
            </Link>
            <StatusBadge status={item.status} className="shrink-0" />
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span className="font-mono tabular-nums font-medium text-foreground">
              {formatBrlFromCents(item.valorCreditoCentavos)}
            </span>
            {(item.cidade || item.estado) && (
              <>
                <span className="text-foreground/20">·</span>
                <span>{formatLocalizacao(item.cidade, item.estado)}</span>
              </>
            )}
            {item.origem && (
              <>
                <span className="text-foreground/20">·</span>
                <span>{item.origem}</span>
              </>
            )}
          </div>
        </div>
        <Link
          href={`/leads/${item.leadId}`}
          prefetch={false}
          className="shrink-0 text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          aria-label="Abrir detalhe do lead"
        >
          <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {/* Motivo destacado */}
      <div className="mb-3">
        <Badge
          variant={PILL_VARIANT[tone.pill]}
          className="font-medium text-xs"
        >
          {item.motivo}
        </Badge>
      </div>

      <QuickActionsToolbar item={item} onResolved={onResolved} />
    </article>
  );
}
