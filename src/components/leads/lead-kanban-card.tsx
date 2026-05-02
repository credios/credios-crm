"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Snowflake } from "lucide-react";
import Link from "next/link";

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

export function LeadKanbanCard({ lead }: { lead: LeadRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const cold = isEsfriando(lead.ultimoContato);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border bg-card p-3 shadow-sm hover:shadow-md transition-shadow space-y-2",
        cold && "border-blue-300/60",
        lead.slaAtrasado && "border-destructive/60 ring-1 ring-destructive/20",
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${lead.id}`}
          className="font-medium text-sm hover:underline line-clamp-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {lead.nome}
        </Link>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {lead.slaAtrasado && (
            <AlertTriangle className="size-3.5 text-destructive" aria-label="SLA: sem 1º contato há mais de 30min" />
          )}
          {cold && <Snowflake className="size-3.5 text-blue-500" aria-label="Esfriando" />}
        </div>
      </div>

      <p className="text-sm font-semibold">
        {formatBrlShort(lead.valorCreditoCentavos)}
      </p>

      <div className="flex items-center gap-1 flex-wrap">
        {lead.origem && (
          <Badge variant="outline" className="text-xs">
            {lead.origem}
          </Badge>
        )}
        {lead.estado && (
          <Badge variant="secondary" className="text-xs">
            {lead.estado}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {lead.ultimoContato ? formatRelative(lead.ultimoContato) : "sem contato"}
        </span>
        {lead.consultorNome ? (
          <Avatar className="size-5">
            <AvatarFallback className="text-[10px]" title={lead.consultorNome}>
              {initials(lead.consultorNome)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="italic">pool</span>
        )}
      </div>
    </div>
  );
}
