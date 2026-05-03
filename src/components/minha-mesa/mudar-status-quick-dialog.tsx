"use client";

import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LEAD_LABEL } from "@/lib/constants";

// Status simples (sem campos extras). Pra fechar/desqualificar/perder, abrir
// o detalhe — esses pedem motivo, banco, valor liberado etc.
const STATUS_SIMPLES = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "sem_resposta",
] as const;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
  statusAtual: string;
  onSuccess: () => void;
};

export function MudarStatusQuickDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  statusAtual,
  onSuccess,
}: Props) {
  const [novoStatus, setNovoStatus] = useState<string>("");
  const [pending, setPending] = useState(false);

  function reset() {
    setNovoStatus("");
  }

  async function handleConfirm() {
    if (!novoStatus) return;
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não consegui mudar status", {
        description:
          typeof json.error === "string" ? json.error : `Falha ${res.status}`,
      });
      return;
    }
    toast.success(`→ ${STATUS_LEAD_LABEL[novoStatus] ?? novoStatus}`);
    reset();
    onSuccess();
  }

  const opcoes = STATUS_SIMPLES.filter((s) => s !== statusAtual);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) {
          onOpenChange(false);
          reset();
        } else if (o) {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mudar status</DialogTitle>
          <DialogDescription>
            Lead: <strong>{leadNome}</strong>. De{" "}
            <strong>{STATUS_LEAD_LABEL[statusAtual] ?? statusAtual}</strong>{" "}
            para…
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="novo-status">Novo status</Label>
          <Select
            value={novoStatus}
            onValueChange={(v) => setNovoStatus(v ?? "")}
            disabled={pending}
          >
            <SelectTrigger id="novo-status">
              <SelectValue placeholder="Escolha…" />
            </SelectTrigger>
            <SelectContent>
              {opcoes.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LEAD_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground italic">
            Pra fechar / desqualificar / marcar como perdido, abra o detalhe do
            lead — esses pedem campos extras (banco, valor, motivo).
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending || !novoStatus}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Mudar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
