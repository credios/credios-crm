"use client";

import { Download, Loader2, UserCheck, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import type { LeadRow } from "@/lib/leads/list-leads";

const NON_TERMINAL_STATUSES = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "sem_resposta",
];

type Props = {
  selectedLeads: LeadRow[];
  consultores: { id: string; nome: string }[];
  onDone: () => void;
  onClear: () => void;
};

export function LeadBulkActions({ selectedLeads, consultores, onDone, onClear }: Props) {
  const [openReassign, setOpenReassign] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);

  function handleExport() {
    const csv = leadsToCsv(selectedLeads);
    downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`${selectedLeads.length} leads exportados`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-accent/50 px-3 py-2">
        <span className="text-sm font-medium">{selectedLeads.length} selecionados</span>
        <div className="flex-1" />
        <BulkButton icon={UserCheck} label="Reatribuir" onClick={() => setOpenReassign(true)} />
        <BulkButton icon={UserCheck} label="Mudar status" onClick={() => setOpenStatus(true)} />
        <BulkButton icon={Download} label="Exportar CSV" onClick={handleExport} />
        <Button variant="ghost" size="sm" onClick={onClear}>
          Limpar seleção
        </Button>
      </div>

      <BulkReassignDialog
        open={openReassign}
        onOpenChange={setOpenReassign}
        leads={selectedLeads}
        consultores={consultores}
        onDone={() => {
          setOpenReassign(false);
          onDone();
        }}
      />
      <BulkStatusDialog
        open={openStatus}
        onOpenChange={setOpenStatus}
        leads={selectedLeads}
        onDone={() => {
          setOpenStatus(false);
          onDone();
        }}
      />
    </>
  );
}

function BulkButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Icon className="size-3.5" /> {label}
    </Button>
  );
}

function BulkReassignDialog({
  open,
  onOpenChange,
  leads,
  consultores,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leads: LeadRow[];
  consultores: { id: string; nome: string }[];
  onDone: () => void;
}) {
  const [consultorId, setConsultorId] = useState<string>("__pool__");
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    const targetId = consultorId === "__pool__" ? null : consultorId;
    let success = 0;
    let failed = 0;
    for (const lead of leads) {
      const res = await fetch(`/api/leads/${lead.id}/atribuicao`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consultorId: targetId }),
      });
      if (res.ok) success++;
      else failed++;
    }
    setPending(false);
    if (failed === 0) toast.success(`${success} leads reatribuídos`);
    else toast.error(`${success} reatribuídos, ${failed} falharam`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reatribuir {leads.length} leads</DialogTitle>
          <DialogDescription>Operação aplicada em sequência (1 por 1).</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
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

function BulkStatusDialog({
  open,
  onOpenChange,
  leads,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leads: LeadRow[];
  onDone: () => void;
}) {
  const [novoStatus, setNovoStatus] = useState<string>("");
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    if (!novoStatus) return;
    setPending(true);
    let success = 0;
    let failed = 0;
    for (const lead of leads) {
      const res = await fetch(`/api/leads/${lead.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (res.ok) success++;
      else failed++;
    }
    setPending(false);
    if (failed === 0) toast.success(`${success} leads atualizados`);
    else toast.error(`${success} atualizados, ${failed} falharam`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mudar status de {leads.length} leads</DialogTitle>
          <DialogDescription>
            Para fechar/desqualificar/perder, faça individualmente — esses status precisam de campos extras (banco, motivo).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Select value={novoStatus} onValueChange={(v) => setNovoStatus(v ?? "")} disabled={pending}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha o novo status">
                {(v: unknown) =>
                  typeof v === "string" && v ? STATUS_LEAD_LABEL[v] ?? v : null
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {NON_TERMINAL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LEAD_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending || !novoStatus}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== CSV =====

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function leadsToCsv(leads: LeadRow[]): string {
  const headers = [
    "id",
    "nome",
    "cpf",
    "email",
    "whatsapp",
    "cidade",
    "estado",
    "status",
    "valor_credito",
    "valor_imovel",
    "origem",
    "consultor",
    "ultimo_contato",
    "criado_em",
  ];
  const rows = leads.map((l) =>
    [
      l.id,
      l.nome,
      l.cpf ?? "",
      l.email ?? "",
      l.whatsapp ?? "",
      l.cidade ?? "",
      l.estado ?? "",
      l.status,
      l.valorCreditoCentavos != null ? (l.valorCreditoCentavos / 100).toFixed(2) : "",
      l.valorImovelCentavos != null ? (l.valorImovelCentavos / 100).toFixed(2) : "",
      l.origem ?? "",
      l.consultorNome ?? "",
      l.ultimoContato ? new Date(l.ultimoContato).toISOString() : "",
      l.createdAt ? new Date(l.createdAt).toISOString() : "",
    ]
      .map(escapeCsv)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
