/* eslint-disable react-hooks/set-state-in-effect */
// Sync state local com props (server) quando router.refresh() trouxer dados novos:
// é um padrão de "controlled-from-server" mas o lint não distingue do anti-pattern.
"use client";

import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { LeadFilters } from "./lead-filters";
import { LeadKanbanCard } from "./lead-kanban-card";
import {
  DesqualificacaoDialog,
  FechamentoDialog,
} from "./lead-status-dialogs";
import { ViewToggle } from "./view-toggle";
import { Button } from "@/components/ui/button";
import {
  BANCOS_PARCEIROS,
  STATUS_LEAD_LABEL,
} from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBrlShort } from "@/lib/formatters/currency";
import type { LeadRow } from "@/lib/leads/list-leads";
import { useLeadsRealtime } from "@/lib/realtime/use-leads-realtime";
import { cn } from "@/lib/utils";

import { statusBadgeColor } from "./status-badge";

// Status agora vêm do servidor (status_lead_config). Custom statuses entram
// como colunas extras. As 4 system terminals (fechado/desq/perdido/sem_resp)
// e as 2 que pedem bancos (documentacao_enviada/em_negociacao) ainda têm
// modais especiais — checkados por key.
type Status = string;

type StatusMeta = { key: string; label: string; eTerminal: boolean };

type Props = {
  leads: LeadRow[];
  consultores: { id: string; nome: string }[];
  /** Sources ativos do DB (tracking_sources). Substitui o array `origens` legado. */
  sources: Array<{ source: string; channel: string; displayName: string }>;
  /** Apenas admin pode fechar leads ou tirar leads do status fechado. */
  canCloseOrReopen: boolean;
  /** Status ATIVOS, ordenados. Vem de listActiveStatuses(). */
  statuses: StatusMeta[];
};

type Cols = Record<string, LeadRow[]>;

function groupByStatus(leads: LeadRow[], statusKeys: string[]): Cols {
  const set = new Set(statusKeys);
  const out: Cols = {};
  for (const s of statusKeys) out[s] = [];
  // Fallback: leads com status inativo/desconhecido vão pra primeira coluna.
  const fallback = statusKeys[0] ?? "novo";
  if (!out[fallback]) out[fallback] = [];
  for (const lead of leads) {
    const key = set.has(lead.status) ? lead.status : fallback;
    out[key]!.push(lead);
  }
  return out;
}

function flattenCols(cols: Cols, statusKeys: string[]): LeadRow[] {
  return statusKeys.flatMap((s) => cols[s] ?? []);
}

// Detecção de colisão híbrida — pointerWithin segue o cursor (estilo Notion);
// fallback rectIntersection se cursor estiver fora de qualquer droppable.
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return rectIntersection(args);
};

export function LeadKanban({
  leads,
  consultores,
  sources,
  canCloseOrReopen,
  statuses,
}: Props) {
  const router = useRouter();

  const statusKeys = useMemo(() => statuses.map((s) => s.key), [statuses]);
  const statusKeysJoined = statusKeys.join("|");
  // statusSet rebuilds when keys change — statusKeys ref is stable per render,
  // but dep on statusKeysJoined cobre semanticamente o que importa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const statusSet = useMemo(() => new Set(statusKeys), [statusKeysJoined]);
  const statusLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of statuses) m[s.key] = s.label;
    return m;
  }, [statuses]);

  // Estado local pra otimismo: muda na hora, server confirma depois.
  // Ressincroniza quando props chegarem novas (router.refresh / realtime).
  const [cols, setCols] = useState<Cols>(() => groupByStatus(leads, statusKeys));
  const leadsKey = useMemo(
    () => leads.map((l) => `${l.id}:${l.status}`).join("|"),
    [leads],
  );
  useEffect(() => {
    setCols(groupByStatus(leads, statusKeys));
  }, [leadsKey, leads, statusKeysJoined, statusKeys]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const dndId = useId();

  const [pendingTerminal, setPendingTerminal] = useState<{
    leadId: string;
    leadNome: string;
    status: "fechado" | "desqualificado" | "perdido";
    /** Cols snapshot pra restaurar se user cancelar dialog. */
    snapshot: Cols;
  } | null>(null);
  const [pendingBancos, setPendingBancos] = useState<{
    leadId: string;
    leadNome: string;
    status: "documentacao_enviada" | "em_negociacao";
    snapshot: Cols;
  } | null>(null);

  useLeadsRealtime();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const flatLeads = useMemo(
    () => flattenCols(cols, statusKeys),
    [cols, statusKeys],
  );
  const activeLead = useMemo(
    () => (activeId ? flatLeads.find((l) => l.id === activeId) ?? null : null),
    [activeId, flatLeads],
  );

  function findContainer(id: string): Status | null {
    if (statusSet.has(id)) return id;
    for (const s of statusKeys) {
      if ((cols[s] ?? []).some((l) => l.id === id)) return s;
    }
    return null;
  }

  /** Move um lead pra coluna+índice destino, retorna novo Cols. */
  function moveLead(
    current: Cols,
    leadId: string,
    targetStatus: Status,
    targetIndex: number,
  ): Cols {
    // Acha origem
    let sourceStatus: Status | null = null;
    let sourceIndex = -1;
    for (const s of statusKeys) {
      const i = (current[s] ?? []).findIndex((l) => l.id === leadId);
      if (i !== -1) {
        sourceStatus = s;
        sourceIndex = i;
        break;
      }
    }
    if (sourceStatus === null) return current;

    const lead = current[sourceStatus]![sourceIndex]!;
    const updated: Cols = { ...current };
    // Remove da origem
    updated[sourceStatus] = (current[sourceStatus] ?? []).filter(
      (l) => l.id !== leadId,
    );
    // Atualiza status no objeto e insere na posição
    const movedLead: LeadRow = { ...lead, status: targetStatus };
    const targetCol =
      sourceStatus === targetStatus
        ? updated[targetStatus] ?? []
        : [...(current[targetStatus] ?? [])];
    // Clamp index
    const idx = Math.max(0, Math.min(targetIndex, targetCol.length));
    targetCol.splice(idx, 0, movedLead);
    updated[targetStatus] = targetCol;
    return updated;
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  // dragOver: mostra preview live do destino enquanto arrasta entre colunas
  // diferentes (sem commit no servidor — só visual). Source vai pro topo da
  // coluna alvo. Quando solta em posição específica, refinamos no dragEnd.
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const activeContainer = findContainer(activeIdStr);
    const overContainer = findContainer(overIdStr);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return; // mesmo container — só dragEnd cuida

    // Bloqueio visual: não-admin não pode preview drop em fechado nem mover
    // de fechado pra outra coluna. Mantém ghost na origem.
    if (
      !canCloseOrReopen &&
      (overContainer === "fechado" || activeContainer === "fechado")
    ) {
      return;
    }

    setCols((prev) => {
      const sourceCol = (prev[activeContainer] ?? []).filter(
        (l) => l.id !== activeIdStr,
      );
      const overIsLead = !statusSet.has(overIdStr);
      const targetCol = [...(prev[overContainer] ?? [])];
      const insertAt = overIsLead
        ? targetCol.findIndex((l) => l.id === overIdStr)
        : 0;
      const lead = (prev[activeContainer] ?? []).find((l) => l.id === activeIdStr);
      if (!lead) return prev;
      targetCol.splice(insertAt < 0 ? 0 : insertAt, 0, {
        ...lead,
        status: overContainer,
      });
      return { ...prev, [activeContainer]: sourceCol, [overContainer]: targetCol };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const draggedId = activeId;
    setActiveId(null);
    const { active, over } = e;
    if (!over) {
      // Drop fora: reverte
      setCols(groupByStatus(leads, statusKeys));
      return;
    }
    const leadId = String(active.id);
    const overId = String(over.id);

    // Status alvo: coluna direta ou status do lead alvo.
    let targetStatus: Status | null = null;
    let targetIndex = 0;

    if (statusSet.has(overId)) {
      targetStatus = overId;
      targetIndex = 0;
    } else {
      // Drop em outro card — usa o status atual já refletido no state otimista
      const overInState = findContainer(overId);
      if (overInState) {
        targetStatus = overInState;
        targetIndex = (cols[overInState] ?? []).findIndex((l) => l.id === overId);
      }
    }

    if (!targetStatus) return;

    // Calcula original status (pré-drag) usando props
    const original = leads.find((l) => l.id === leadId);
    if (!original) return;
    const originalStatus = original.status;

    // Permissão: tocar status 'fechado' (entrar OU sair) é admin only.
    const tocaFechado =
      targetStatus === "fechado" || originalStatus === "fechado";
    if (tocaFechado && !canCloseOrReopen) {
      setCols(groupByStatus(leads, statusKeys));
      toast.error("Apenas administradores podem fechar ou reabrir leads.", {
        description: "Valores de comissão por banco são confidenciais.",
      });
      return;
    }

    // Status terminal: abre modal e desfaz visual provisoriamente até confirmar
    if (
      targetStatus === "fechado" ||
      targetStatus === "desqualificado" ||
      targetStatus === "perdido"
    ) {
      // Snapshot pra restaurar caso cancele
      const snap = groupByStatus(leads, statusKeys);
      // Mantém visualmente no destino enquanto modal está aberto
      setCols((prev) =>
        moveLead(prev, leadId, targetStatus!, targetIndex),
      );
      setPendingTerminal({
        leadId,
        leadNome: original.nome,
        status: targetStatus,
        snapshot: snap,
      });
      return;
    }

    // Sem mudança de status — mantém estado atual (drag interno reordenado)
    if (originalStatus === targetStatus) return;

    if (targetStatus === "documentacao_enviada" || targetStatus === "em_negociacao") {
      const snap = groupByStatus(leads, statusKeys);
      setCols((prev) => moveLead(prev, leadId, targetStatus!, targetIndex));
      setPendingBancos({
        leadId,
        leadNome: original.nome,
        status: targetStatus,
        snapshot: snap,
      });
      return;
    }

    // Final position: aplicar move otimista + fire-and-forget API
    setCols((prev) => moveLead(prev, leadId, targetStatus!, targetIndex));

    fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: targetStatus }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast.error("Não foi possível mover", {
            description:
              typeof json.error === "string" ? json.error : undefined,
          });
          // Reverte
          setCols(groupByStatus(leads, statusKeys));
        } else {
          toast.success(`→ ${statusLabelMap[targetStatus!] ?? targetStatus!}`);
          router.refresh();
        }
      })
      .catch(() => {
        toast.error("Erro de rede ao mover");
        setCols(groupByStatus(leads, statusKeys));
      });

    void draggedId;
  }

  return (
    <div className="space-y-4">
      <LeadFilters consultores={consultores} sources={sources} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle current="kanban" />
        <div className="flex items-center gap-3">
          {leads.length >= 500 && (
            <p className="text-xs text-amber-600">
              Mostrando 500 leads (limite) — use filtros pra refinar.
            </p>
          )}
          <Button
            nativeButton={false}
            render={<Link href="/leads/novo">+ Novo lead</Link>}
          />
        </div>
      </div>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-h-[60vh]">
            {statusKeys.map((status) => {
              const items = cols[status] ?? [];
              const sumCents = items.reduce(
                (acc, l) => acc + (l.valorCreditoCentavos ?? 0),
                0,
              );
              const locked = !canCloseOrReopen && status === "fechado";
              return (
                <Column
                  key={status}
                  status={status}
                  label={statusLabelMap[status] ?? status}
                  count={items.length}
                  sumCents={sumCents}
                  items={items}
                  activeId={activeId}
                  locked={locked}
                  hideValor={!canCloseOrReopen && status === "fechado"}
                />
              );
            })}
          </div>
        </div>

        <DragOverlay
          dropAnimation={{
            duration: 180,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          zIndex={70}
        >
          {activeLead ? (
            <div className="w-72">
              <LeadKanbanCard lead={activeLead} isOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {pendingTerminal && pendingTerminal.status === "fechado" && (
        <FechamentoDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setCols(pendingTerminal.snapshot);
              setPendingTerminal(null);
            }
          }}
          leadId={pendingTerminal.leadId}
          leadNome={pendingTerminal.leadNome}
          onSuccess={() => {
            setPendingTerminal(null);
            router.refresh();
          }}
          onCancel={() => {
            setCols(pendingTerminal.snapshot);
            setPendingTerminal(null);
          }}
        />
      )}
      {pendingTerminal &&
        (pendingTerminal.status === "desqualificado" ||
          pendingTerminal.status === "perdido") && (
          <DesqualificacaoDialog
            open
            onOpenChange={(o) => {
              if (!o) {
                setCols(pendingTerminal.snapshot);
                setPendingTerminal(null);
              }
            }}
            leadId={pendingTerminal.leadId}
            leadNome={pendingTerminal.leadNome}
            status={pendingTerminal.status}
            onSuccess={() => {
              setPendingTerminal(null);
              router.refresh();
            }}
            onCancel={() => {
              setCols(pendingTerminal.snapshot);
              setPendingTerminal(null);
            }}
          />
        )}
      {pendingBancos && (
        <KanbanBancosDialog
          open
          leadId={pendingBancos.leadId}
          leadNome={pendingBancos.leadNome}
          status={pendingBancos.status}
          onOpenChange={(o) => {
            if (!o) {
              setCols(pendingBancos.snapshot);
              setPendingBancos(null);
            }
          }}
          onSuccess={() => {
            setPendingBancos(null);
            router.refresh();
          }}
          onCancel={() => {
            setCols(pendingBancos.snapshot);
            setPendingBancos(null);
          }}
        />
      )}
    </div>
  );
}

function KanbanBancosDialog({
  open,
  onOpenChange,
  onCancel,
  leadId,
  leadNome,
  status,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCancel: () => void;
  leadId: string;
  leadNome: string;
  status: "documentacao_enviada" | "em_negociacao";
  onSuccess: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  function toggle(banco: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(banco)) next.delete(banco);
      else next.add(banco);
      return next;
    });
  }

  async function handleConfirm() {
    if (selected.size === 0) {
      toast.error("Selecione ao menos um banco");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, bancos: Array.from(selected) }),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error("Não foi possível mover", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      onCancel();
      return;
    }
    toast.success(`${leadNome} → ${STATUS_LEAD_LABEL[status] ?? status}`);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{STATUS_LEAD_LABEL[status]} · bancos enviados</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {BANCOS_PARCEIROS.map((banco) => {
            const active = selected.has(banco);
            return (
              <button
                key={banco}
                type="button"
                onClick={() => toggle(banco)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-muted",
                )}
              >
                {banco}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Column({
  status,
  label,
  count,
  sumCents,
  items,
  activeId,
  locked,
  hideValor,
}: {
  status: Status;
  label: string;
  count: number;
  sumCents: number;
  items: LeadRow[];
  activeId: string | null;
  locked?: boolean;
  hideValor?: boolean;
}) {
  // Coluna locked desabilita o droppable inteiro pra não-admin não poder soltar.
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: !!locked,
  });
  const colorCls = statusBadgeColor(status);
  const cssVarKey = status.replace(/_/g, "-");
  const isHighlighted = activeId !== null;

  return (
    <div
      className={cn(
        "surface-frosted w-72 shrink-0 flex flex-col rounded-lg overflow-hidden",
        locked && "opacity-90",
      )}
      style={{
        borderLeftWidth: "3px",
        borderLeftColor: `var(--color-status-${cssVarKey}, var(--color-charcoal-300))`,
      }}
      title={locked ? "Apenas administradores podem mover leads aqui" : undefined}
    >
      <div
        className={cn(
          "px-3 py-2 border-b border-foreground/8 sticky top-0 z-10 backdrop-blur-md",
          colorCls,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold tracking-tight flex items-center gap-1">
            {label}
            {locked && (
              <Lock
                className="size-3 text-current opacity-60"
                aria-label="admin only"
              />
            )}
          </h3>
          <span className="font-mono text-[11px] font-medium tabular-nums">
            {count}
          </span>
        </div>
        {hideValor ? (
          <p className="font-mono text-[11px] opacity-60 mt-0.5 italic">
            R$ confidencial
          </p>
        ) : (
          <p className="font-mono text-[11px] opacity-80 mt-0.5 tabular-nums">
            {formatBrlShort(sumCents)}
          </p>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          // Altura muito maior pra mostrar ~10 cards antes de scroll. Em monitor
          // 1080px verticais cabe ~9-10 cards; em 1440px+ cabe muito mais.
          "flex-1 p-1.5 space-y-1.5 overflow-y-auto overflow-x-hidden max-h-[calc(100vh-12rem)] transition-[background,outline] duration-fast ease-out-soft",
          isHighlighted && !locked && "bg-foreground/3",
          isHighlighted && locked && "bg-rose-500/8 cursor-not-allowed",
          isOver &&
            !locked &&
            "outline outline-2 outline-dashed outline-offset-[-4px] bg-foreground/4",
        )}
        style={
          isOver && !locked
            ? {
                outlineColor: `color-mix(in oklch, var(--color-status-${cssVarKey}, var(--color-charcoal-400)) 60%, transparent)`,
              }
            : undefined
        }
      >
        {locked && items.length === 0 && (
          <p className="text-[11px] text-fg-faint text-center py-3 font-serif italic">
            sem visibilidade
          </p>
        )}
        {!locked && items.length === 0 && (
          <p className="text-[11px] text-fg-faint text-center py-3 font-serif italic">
            vazio
          </p>
        )}
        {items.map((lead) => (
          <LeadKanbanCard
            key={lead.id}
            lead={lead}
            isGhost={activeId === lead.id}
            // Cards de leads fechados também ficam locked se user não puder reabrir.
            isLocked={!!locked}
          />
        ))}
      </div>
    </div>
  );
}
