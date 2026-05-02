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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MOTIVOS_DESQUALIFICACAO, MOTIVOS_PERDIDO } from "@/lib/constants";

type CommonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadNome?: string;
  onSuccess: () => void;
  onCancel?: () => void;
};

// ============================================================================
// Modal: Fechar lead
// ============================================================================

export function FechamentoDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  onSuccess,
  onCancel,
}: CommonProps) {
  const [banco, setBanco] = useState("");
  const [valorLiberado, setValorLiberado] = useState("");
  const [comissao, setComissao] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setBanco("");
    setValorLiberado("");
    setComissao("");
    setData(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  async function handleConfirm() {
    setError(null);
    if (!banco.trim()) {
      setError("Informe o banco aprovador");
      return;
    }
    const vl = Number(valorLiberado);
    const cm = Number(comissao);
    if (!Number.isFinite(vl) || vl < 0) {
      setError("Valor liberado inválido");
      return;
    }
    if (!Number.isFinite(cm) || cm < 0) {
      setError("Comissão inválida");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "fechado",
        bancoAprovador: banco.trim(),
        valorLiberadoCentavos: Math.round(vl * 100),
        comissaoCentavos: Math.round(cm * 100),
        dataFechamento: data,
      }),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : `Falha (${res.status})`);
      return;
    }
    toast.success(leadNome ? `Lead "${leadNome}" fechado` : "Lead fechado");
    reset();
    onSuccess();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) {
          onCancel?.();
          onOpenChange(false);
          reset();
        } else if (o) {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como fechado</DialogTitle>
          <DialogDescription>
            {leadNome ? <>Fechando o lead <strong>{leadNome}</strong>.</> : null} Informe os dados do fechamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fech-banco">Banco aprovador</Label>
            <Input
              id="fech-banco"
              value={banco}
              onChange={(e) => setBanco(e.currentTarget.value)}
              placeholder="Ex: Itaú, Santander…"
              disabled={pending}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fech-vl">Valor liberado (R$)</Label>
              <Input
                id="fech-vl"
                type="number"
                step="0.01"
                min="0"
                value={valorLiberado}
                onChange={(e) => setValorLiberado(e.currentTarget.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fech-cm">Comissão (R$)</Label>
              <Input
                id="fech-cm"
                type="number"
                step="0.01"
                min="0"
                value={comissao}
                onChange={(e) => setComissao(e.currentTarget.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fech-data">Data do fechamento</Label>
            <Input
              id="fech-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.currentTarget.value)}
              disabled={pending}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
              reset();
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Confirmar fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Modal: Desqualificar / Perder
// ============================================================================

export function DesqualificacaoDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  status,
  onSuccess,
  onCancel,
}: CommonProps & { status: "desqualificado" | "perdido" }) {
  const [motivo, setMotivo] = useState<string>("");
  const [outroMotivo, setOutroMotivo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lista correta de motivos por status — desqualificado (pré-funil) e
  // perdido (no funil mas não fechou) têm causas distintas.
  const motivos =
    status === "desqualificado" ? MOTIVOS_DESQUALIFICACAO : MOTIVOS_PERDIDO;

  const isOutro = motivo === "Outro";

  function reset() {
    setMotivo("");
    setOutroMotivo("");
    setError(null);
  }

  async function handleConfirm() {
    setError(null);
    const motivoFinal = isOutro ? outroMotivo.trim() : motivo;
    if (!motivoFinal) {
      setError("Selecione um motivo");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, motivoDesqualificacao: motivoFinal }),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : `Falha (${res.status})`);
      return;
    }
    toast.success(`Lead marcado como ${status}`);
    reset();
    onSuccess();
  }

  const titulo = status === "desqualificado" ? "Desqualificar lead" : "Marcar como perdido";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) {
          onCancel?.();
          onOpenChange(false);
          reset();
        } else if (o) {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {leadNome ? <>Lead: <strong>{leadNome}</strong>.</> : null} Informe o motivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={(v) => setMotivo(v ?? "")} disabled={pending}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um motivo" />
              </SelectTrigger>
              <SelectContent>
                {motivos.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isOutro && (
            <div className="space-y-1.5">
              <Label htmlFor="motivo-outro">Descreva</Label>
              <Textarea
                id="motivo-outro"
                value={outroMotivo}
                onChange={(e) => setOutroMotivo(e.currentTarget.value)}
                rows={3}
                disabled={pending}
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
              reset();
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending} variant="destructive">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
