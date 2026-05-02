"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { LeadFilters } from "./lead-filters";
import { LeadKanbanCard } from "./lead-kanban-card";
import {
  DesqualificacaoDialog,
  FechamentoDialog,
} from "./lead-status-dialogs";
import { ViewToggle } from "./view-toggle";
import { Button } from "@/components/ui/button";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { LeadRow } from "@/lib/leads/list-leads";
import { useLeadsRealtime } from "@/lib/realtime/use-leads-realtime";
import { cn } from "@/lib/utils";

import { statusBadgeColor } from "./status-badge";

const STATUS_ORDER = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "fechado",
  "perdido",
  "sem_resposta",
  "desqualificado",
] as const;

type Props = {
  leads: LeadRow[];
  consultores: { id: string; nome: string }[];
  origens: string[];
};

export function LeadKanban({ leads, consultores, origens }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Modal pra status terminais (fechado / desqualificado / perdido).
  const [pendingTerminal, setPendingTerminal] = useState<{
    leadId: string;
    leadNome: string;
    status: "fechado" | "desqualificado" | "perdido";
  } | null>(null);

  useLeadsRealtime();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const grouped = useMemo(() => {
    const out: Record<string, LeadRow[]> = {};
    for (const s of STATUS_ORDER) out[s] = [];
    for (const lead of leads) {
      const key = STATUS_ORDER.includes(lead.status as (typeof STATUS_ORDER)[number])
        ? lead.status
        : "novo";
      out[key].push(lead);
    }
    return out;
  }, [leads]);

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) return;
    const leadId = String(active.id);
    const newStatus = String(over.id) as (typeof STATUS_ORDER)[number];
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    if (lead.status === newStatus) return;

    if (newStatus === "fechado" || newStatus === "desqualificado" || newStatus === "perdido") {
      setPendingTerminal({ leadId, leadNome: lead.nome, status: newStatus });
      return;
    }

    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não foi possível mover", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success(`Status mudou para ${STATUS_LEAD_LABEL[newStatus]}`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <LeadFilters consultores={consultores} origens={origens} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle current="kanban" />
        <div className="flex items-center gap-3">
          {leads.length >= 500 && (
            <p className="text-xs text-amber-600">
              Mostrando 500 leads (limite) — use filtros pra refinar.
            </p>
          )}
          <Button nativeButton={false} render={<Link href="/leads/novo">+ Novo lead</Link>} />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-h-[60vh]">
            {STATUS_ORDER.map((status) => {
              const items = grouped[status];
              const sumCents = items.reduce(
                (acc, l) => acc + (l.valorCreditoCentavos ?? 0),
                0,
              );
              return (
                <Column
                  key={status}
                  status={status}
                  count={items.length}
                  sumCents={sumCents}
                  items={items}
                  isHighlighted={draggingId !== null}
                />
              );
            })}
          </div>
        </div>
      </DndContext>

      {pendingTerminal && pendingTerminal.status === "fechado" && (
        <FechamentoDialog
          open
          onOpenChange={(o) => !o && setPendingTerminal(null)}
          leadId={pendingTerminal.leadId}
          leadNome={pendingTerminal.leadNome}
          onSuccess={() => {
            setPendingTerminal(null);
            startTransition(() => router.refresh());
          }}
          onCancel={() => setPendingTerminal(null)}
        />
      )}
      {pendingTerminal &&
        (pendingTerminal.status === "desqualificado" ||
          pendingTerminal.status === "perdido") && (
          <DesqualificacaoDialog
            open
            onOpenChange={(o) => !o && setPendingTerminal(null)}
            leadId={pendingTerminal.leadId}
            leadNome={pendingTerminal.leadNome}
            status={pendingTerminal.status}
            onSuccess={() => {
              setPendingTerminal(null);
              startTransition(() => router.refresh());
            }}
            onCancel={() => setPendingTerminal(null)}
          />
        )}
    </div>
  );
}

function Column({
  status,
  count,
  sumCents,
  items,
  isHighlighted,
}: {
  status: (typeof STATUS_ORDER)[number];
  count: number;
  sumCents: number;
  items: LeadRow[];
  isHighlighted: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const colorCls = statusBadgeColor(status);

  return (
    <div className="w-72 shrink-0 flex flex-col rounded-md border bg-muted/30">
      <div className={cn("p-2.5 border-b rounded-t-md", colorCls)}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{STATUS_LEAD_LABEL[status]}</h3>
          <span className="text-xs font-mono">{count}</span>
        </div>
        <p className="text-xs opacity-70 mt-0.5">{formatBrlShort(sumCents)}</p>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-22rem)]",
          isHighlighted && "bg-muted/50",
          isOver && "ring-2 ring-foreground/30 ring-inset",
        )}
      >
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 italic">
            sem leads
          </p>
        )}
        {items.map((lead) => (
          <LeadKanbanCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}
