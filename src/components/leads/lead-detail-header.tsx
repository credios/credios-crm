"use client";

import {
  ArrowLeft,
  Copy,
  Loader2,
  MessageCircle,
  MoreVertical,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "./status-badge";
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
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { whatsappUrl } from "@/lib/formatters/phone";

const STATUS_NON_TERMINAL = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "sem_resposta",
];

type LeadHeaderData = {
  id: string;
  nome: string;
  status: string;
  valorCreditoCentavos: number | null;
  whatsapp: string | null;
  email: string | null;
};

type Props = {
  lead: LeadHeaderData;
  canEdit: boolean;
  canAssign: boolean;
  isAdmin: boolean;
  consultores: { id: string; nome: string }[];
};

export function LeadDetailHeader({ lead, canEdit, canAssign, isAdmin, consultores }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [openFechar, setOpenFechar] = useState(false);
  const [openDesq, setOpenDesq] = useState<"desqualificado" | "perdido" | null>(null);
  const [openReassign, setOpenReassign] = useState(false);
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
    toast.success(`Status alterado para ${STATUS_LEAD_LABEL[novoStatus] ?? novoStatus}`);
    startTransition(() => router.refresh());
  }

  async function markLastContact() {
    setPendingMark(true);
    const res = await fetch(`/api/leads/${lead.id}/interacoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "anotacao", conteudo: "Último contato registrado" }),
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

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/leads"><ArrowLeft className="size-4" /> Voltar</Link>} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{lead.nome}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={lead.status} />
            <span className="text-lg font-semibold">
              {formatBrlFromCents(lead.valorCreditoCentavos)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <>
              {isFechado && !isAdmin ? (
                <Button variant="outline" disabled title="Lead fechado — só admin reabre">
                  Mudar status
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="outline" disabled={pendingStatus}>
                        {pendingStatus && <Loader2 className="size-3.5 animate-spin" />}
                        Mudar status
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Não-terminais</DropdownMenuLabel>
                    {STATUS_NON_TERMINAL.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => changeStatus(s)}>
                        {STATUS_LEAD_LABEL[s]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Terminais</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => changeStatus("fechado")}>
                      Fechado
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeStatus("desqualificado")} variant="destructive">
                      Desqualificado
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeStatus("perdido")} variant="destructive">
                      Perdido
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
          {canAssign && (
            <Button variant="outline" onClick={() => setOpenReassign(true)}>
              <UserPlus className="size-4" /> Reatribuir
            </Button>
          )}
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
              <Copy className="size-4" /> Copiar email
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={markLastContact} disabled={pendingMark}>
              {pendingMark ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
              Marcar último contato
            </Button>
          )}
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
    </div>
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
