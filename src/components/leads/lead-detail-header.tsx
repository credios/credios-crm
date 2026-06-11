"use client";

import {
  Copy,
  Loader2,
  MessageCircle,
  MoreVertical,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "./status-badge";
import { BackButton } from "@/components/shared/back-button";
import {
  DesqualificacaoDialog,
  FechamentoDialog,
} from "./lead-status-dialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { BancosPicker } from "@/components/leads/bancos-picker";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { whatsappUrl } from "@/lib/formatters/phone";

type LeadHeaderData = {
  id: string;
  nome: string;
  status: string;
  valorCreditoCentavos: number | null;
  whatsapp: string | null;
  email: string | null;
};

type StatusMeta = { key: string; label: string; eTerminal: boolean };

type Props = {
  lead: LeadHeaderData;
  canEdit: boolean;
  canAssign: boolean;
  isAdmin: boolean;
  consultores: { id: string; nome: string }[];
  /** Status ATIVOS (vem do server). Usados pra montar o dropdown de mudança. */
  statuses: StatusMeta[];
};

export function LeadDetailHeader({
  lead,
  canEdit,
  canAssign,
  isAdmin,
  consultores,
  statuses,
}: Props) {
  // Splita em terminais sistema (com tratamento especial) e o resto.
  // Custom statuses entram no bloco "não-terminais" automaticamente.
  const nonTerminals = statuses.filter(
    (s) => !s.eTerminal && s.key !== "fechado",
  );
  const terminals = statuses.filter(
    (s) => s.eTerminal || s.key === "fechado",
  );
  const labelByKey: Record<string, string> = {};
  for (const s of statuses) labelByKey[s.key] = s.label;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [openFechar, setOpenFechar] = useState(false);
  const [openDesq, setOpenDesq] = useState<"desqualificado" | "perdido" | null>(null);
  const [openReassign, setOpenReassign] = useState(false);
  const [openBancosStatus, setOpenBancosStatus] = useState<
    "documentacao_enviada" | "em_negociacao" | null
  >(null);
  const [openDelete, setOpenDelete] = useState(false);
  const [pendingMark, setPendingMark] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(false);

  const isFechado = lead.status === "fechado";
  const wa = whatsappUrl(lead.whatsapp);

  async function changeStatus(novoStatus: string) {
    if (novoStatus === "fechado") return setOpenFechar(true);
    if (novoStatus === "desqualificado" || novoStatus === "perdido") {
      setOpenDesq(novoStatus);
      return;
    }
    if (novoStatus === "documentacao_enviada" || novoStatus === "em_negociacao") {
      setOpenBancosStatus(novoStatus);
      return;
    }
    setPendingStatus(true);
    const res = await fetch(`/api/leads/${lead.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    });
    setPendingStatus(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error("Falha ao mudar status", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success(
      `Status alterado para ${labelByKey[novoStatus] ?? STATUS_LEAD_LABEL[novoStatus] ?? novoStatus}`,
    );
    startTransition(() => router.refresh());
  }

  async function markLastContact() {
    setPendingMark(true);
    const res = await fetch(`/api/leads/${lead.id}/interacoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Sempre tipo "contato" (genérico) — registra na timeline de contatos
      // sem precisar especificar canal (WhatsApp/ligação/email).
      body: JSON.stringify({ tipo: "contato", conteudo: "Último contato registrado" }),
    });
    setPendingMark(false);
    if (!res.ok) {
      toast.error("Não foi possível marcar último contato");
      return;
    }
    toast.success("Último contato marcado");
    startTransition(() => router.refresh());
  }

  function copyEmail() {
    if (!lead.email) return;
    navigator.clipboard.writeText(lead.email);
    toast.success("Email copiado");
  }

  const cssVarKey = lead.status.replace(/_/g, "-");

  return (
    <div className="space-y-4">
      <BackButton />

      <div
        className="surface-solid relative overflow-hidden rounded-2xl px-4 py-5 sm:px-6 sm:py-6"
        style={{
          backgroundImage: `radial-gradient(120% 120% at 0% 0%, color-mix(in oklch, var(--color-status-${cssVarKey}, var(--primary)) 14%, transparent) 0%, transparent 55%)`,
        }}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={lead.status} />
              {isFechado && (
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-700 dark:text-gold-400">
                  · operação concluída
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-[-0.02em] break-words">
              {lead.nome}
            </h1>
            <p className="font-mono tabular-nums text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              {formatBrlFromCents(lead.valorCreditoCentavos)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {wa && (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                }
              />
            )}
            {lead.email && (
              <Button variant="outline" onClick={copyEmail}>
                <Copy className="size-4" /> Email
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={markLastContact} disabled={pendingMark}>
                {pendingMark ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MoreVertical className="size-4" />
                )}
                Último contato
              </Button>
            )}
            {canAssign && (
              <Button variant="outline" onClick={() => setOpenReassign(true)}>
                <UserPlus className="size-4" /> Reatribuir
              </Button>
            )}
            {canEdit && (
              <>
                {isFechado && !isAdmin ? (
                  <Button
                    variant="accent"
                    disabled
                    title="Lead fechado — só admin reabre"
                  >
                    Mudar status
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="accent" disabled={pendingStatus}>
                          {pendingStatus && (
                            <Loader2 className="size-3.5 animate-spin" />
                          )}
                          Mudar status
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Não-terminais</DropdownMenuLabel>
                      {nonTerminals.map((s) => (
                        <DropdownMenuItem
                          key={s.key}
                          onClick={() => changeStatus(s.key)}
                        >
                          {s.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Terminais</DropdownMenuLabel>
                      {terminals.map((s) => {
                        // 'fechado' é admin-only.
                        if (s.key === "fechado" && !isAdmin) return null;
                        return (
                          <DropdownMenuItem
                            key={s.key}
                            onClick={() => changeStatus(s.key)}
                            variant={
                              s.key === "fechado" ? "default" : "destructive"
                            }
                          >
                            {s.label}
                            {s.key === "fechado" && (
                              <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-gold-700 dark:text-gold-400">
                                admin
                              </span>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setOpenDelete(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                title="Excluir lead permanentemente"
              >
                <Trash2 className="size-4" />
                Excluir
              </Button>
            )}
          </div>
        </div>
      </div>

      <FechamentoDialog
        open={openFechar}
        onOpenChange={setOpenFechar}
        leadId={lead.id}
        leadNome={lead.nome}
        onSuccess={() => {
          setOpenFechar(false);
          startTransition(() => router.refresh());
        }}
      />
      {openDesq && (
        <DesqualificacaoDialog
          open
          onOpenChange={(o) => !o && setOpenDesq(null)}
          leadId={lead.id}
          leadNome={lead.nome}
          status={openDesq}
          onSuccess={() => {
            setOpenDesq(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
      <ReassignDialog
        open={openReassign}
        onOpenChange={setOpenReassign}
        leadId={lead.id}
        leadNome={lead.nome}
        consultores={consultores}
        onSuccess={() => {
          setOpenReassign(false);
          startTransition(() => router.refresh());
        }}
      />
      {openBancosStatus && (
        <BancosStatusDialog
          open
          onOpenChange={(o) => !o && setOpenBancosStatus(null)}
          leadId={lead.id}
          status={openBancosStatus}
          onSuccess={() => {
            setOpenBancosStatus(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
      <DeleteLeadDialog
        open={openDelete}
        onOpenChange={setOpenDelete}
        leadId={lead.id}
        leadNome={lead.nome}
      />
    </div>
  );
}

function DeleteLeadDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);

  const matches = confirmation.trim().toLowerCase() === "excluir";

  async function handleConfirm() {
    if (!matches) return;
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Falha ao excluir lead", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success(`Lead "${leadNome}" excluído`);
    onOpenChange(false);
    router.push("/leads");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o);
        if (!o) setConfirmation("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir lead permanentemente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <p>
            Você está prestes a excluir <strong>{leadNome}</strong>. Esta ação{" "}
            <strong className="text-destructive">não pode ser desfeita</strong> e
            também removerá:
          </p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-0.5 text-[13px]">
            <li>Toda a timeline de interações</li>
            <li>Tarefas associadas</li>
            <li>Bancos parceiros vinculados</li>
            <li>Alertas de SLA e duplicidades</li>
          </ul>
          <p className="text-muted-foreground">
            Para confirmar, digite <code className="font-mono font-semibold text-foreground">excluir</code> abaixo:
          </p>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="excluir"
            disabled={pending}
            autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending || !matches}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Excluir permanentemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BancosStatusDialog({
  open,
  onOpenChange,
  leadId,
  status,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
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
      toast.error("Selecione ou informe ao menos um banco");
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
      toast.error("Falha ao mudar status", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success(`Status alterado para ${STATUS_LEAD_LABEL[status]}`);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{STATUS_LEAD_LABEL[status]} · bancos enviados</DialogTitle>
        </DialogHeader>
        <BancosPicker selected={selected} onToggle={toggle} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Confirmar status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  consultores,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
  consultores: { id: string; nome: string }[];
  onSuccess: () => void;
}) {
  const [consultorId, setConsultorId] = useState<string>("__pool__");
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    const targetId = consultorId === "__pool__" ? null : consultorId;
    const res = await fetch(`/api/leads/${leadId}/atribuicao`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consultorId: targetId }),
    });
    setPending(false);
    if (!res.ok) {
      toast.error("Falha ao reatribuir");
      return;
    }
    toast.success(`Lead "${leadNome}" reatribuído`);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reatribuir lead</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Select value={consultorId} onValueChange={(v) => setConsultorId(v ?? "__pool__")} disabled={pending}>
            <SelectTrigger>
              <SelectValue>
                {(v: unknown) => {
                  if (v === "__pool__" || !v) return "Pool não-atribuído";
                  return consultores.find((c) => c.id === v)?.nome ?? String(v);
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__pool__">Pool não-atribuído</SelectItem>
              {consultores.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
