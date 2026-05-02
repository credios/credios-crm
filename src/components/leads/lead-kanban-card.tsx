"use client";

import { useDraggable } from "@dnd-kit/core";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { memo } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatBrlShort } from "@/lib/formatters/currency";
import { formatRelative, isEsfriando } from "@/lib/formatters/date";
import type { LeadRow } from "@/lib/leads/list-leads";
import { cn } from "@/lib/utils";

function initials(nome: string | null): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  lead: LeadRow;
  /** True quando este card é a fonte arrastada (mostra placeholder fantasma na coluna). */
  isGhost?: boolean;
  /** True quando renderizado dentro do DragOverlay (visual "lifted"). */
  isOverlay?: boolean;
  /** True quando user não tem permissão pra mover este card (ex: lead fechado e user não-admin). */
  isLocked?: boolean;
};

function LeadKanbanCardImpl({
  lead,
  isGhost = false,
  isOverlay = false,
  isLocked = false,
}: Props) {
  // No overlay não há draggable real — só um clone visual.
  const draggable = useDraggable({
    id: lead.id,
    disabled: isOverlay || isLocked,
  });
  const { attributes, listeners, setNodeRef } = draggable;

  const cold = isEsfriando(lead.ultimoContato);

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      className={cn(
        "surface-solid group/kbcard space-y-1.5 rounded-md p-2.5 transition-shadow duration-fast ease-out-soft",
        // Fonte arrastada: vira placeholder fantasma (mantém slot mas visual apagado)
        isGhost && "opacity-30 saturate-50",
        // Card no overlay: lift + tilt + sombra forte
        isOverlay &&
          "shadow-elev-lg cursor-grabbing rotate-[-2deg] scale-[1.03] ring-1 ring-primary/30",
        !isOverlay && !isGhost && !isLocked && "cursor-grab hover:shadow-elev-md",
        isLocked && !isOverlay && "cursor-default opacity-90",
        // Esfriando (>=5d sem contato): borda vermelha + ring pra forçar atenção.
        cold &&
          "ring-1 ring-destructive/40 border-l-[3px] border-l-destructive",
        // SLA primeiro contato atrasado: mesma cor do esfriando, fonte diferente.
        lead.slaAtrasado &&
          "ring-1 ring-destructive/40 border-l-[3px] border-l-destructive",
      )}
      // touch-none é crítico em mobile/trackpad pra dnd-kit interceptar antes do scroll.
      style={isOverlay ? undefined : { touchAction: "none" }}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          prefetch={false}
          className="text-sm font-semibold leading-tight tracking-[-0.005em] hover:underline line-clamp-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          draggable={false}
        >
          {lead.nome}
        </Link>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {lead.slaAtrasado && (
            <AlertTriangle
              className="size-3.5 text-destructive"
              aria-label="SLA: sem 1º contato há mais de 30min"
              strokeWidth={1.75}
            />
          )}
          {cold && !lead.slaAtrasado && (
            <AlertTriangle
              className="size-3.5 text-destructive"
              aria-label="Esfriando: 5+ dias sem contato"
              strokeWidth={1.75}
            />
          )}
        </div>
      </div>

      <p className="font-display tabular-nums text-sm font-semibold tracking-tight text-foreground">
        {formatBrlShort(lead.valorCreditoCentavos)}
      </p>

      <div className="flex items-center gap-1 flex-wrap">
        {lead.origem && (
          <Badge variant="soft" className="text-[10px]">
            {lead.origem}
          </Badge>
        )}
        {lead.estado && (
          <Badge variant="outline" className="text-[10px]">
            {lead.estado}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono">
          {lead.ultimoContato ? formatRelative(lead.ultimoContato) : "sem contato"}
        </span>
        {lead.consultorNome ? (
          <Avatar className="size-5 ring-1 ring-foreground/10">
            <AvatarFallback
              className="text-[10px] font-medium"
              title={lead.consultorNome}
            >
              {initials(lead.consultorNome)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="italic font-mono text-[10px]">pool</span>
        )}
      </div>
    </div>
  );
}

/**
 * Memoizado pra reduzir re-renders durante drag. O `cols` no parent muda
 * de referência a cada movimento de drag, mas a maioria dos cards mantém
 * mesma `lead` ref + mesmas flags. Memo evita custo de useDraggable +
 * formatRelative em todos os cards a cada frame de drag.
 *
 * Usa shallow compare default (Props é flat — lead ref + 3 booleans).
 * displayName explícito ajuda devtools/HMR.
 */
const LeadKanbanCard = memo(LeadKanbanCardImpl);
LeadKanbanCard.displayName = "LeadKanbanCard";

export { LeadKanbanCard };
