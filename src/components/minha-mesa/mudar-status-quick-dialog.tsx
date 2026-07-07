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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MOTIVOS_DESQUALIFICACAO,
  MOTIVOS_PERDIDO,
  STATUS_LEAD_LABEL,
} from "@/lib/constants";

// Status simples (sem campos extras). Pra fechar (ganho) ainda é no detalhe do
// lead — pede banco, valor liberado e comissão.
const STATUS_SIMPLES = [
  "novo",
  "conversa_inicial",
  "reuniao_agendada",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
] as const;

// Encerramentos de perda — pedem motivo (coletado aqui mesmo, inline).
const STATUS_ENCERRAMENTO = ["perdido", "desqualificado"] as const;

function isEncerramento(s: string): s is "perdido" | "desqualificado" {
  return s === "perdido" || s === "desqualificado";
}

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
  statusAtual: string;
  onSuccess: () => void;
  /**
   * Inclui "Perdido" e "Desqualificado" nas opções (com coleta de motivo
   * inline). Usado na página de negociações — a reta final do funil precisa
   * registrar quando uma operação morre. Default false (mantém a Minha Mesa
   * só com transições simples).
   */
  incluirEncerramento?: boolean;
};

export function MudarStatusQuickDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  statusAtual,
  onSuccess,
  incluirEncerramento = false,
}: Props) {
  const [novoStatus, setNovoStatus] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [outroMotivo, setOutroMotivo] = useState("");
  const [pending, setPending] = useState(false);

  function reset() {
    setNovoStatus("");
    setMotivo("");
    setOutroMotivo("");
  }

  const perda = isEncerramento(novoStatus);
  const motivos =
    novoStatus === "desqualificado" ? MOTIVOS_DESQUALIFICACAO : MOTIVOS_PERDIDO;
  const isOutro = motivo === "Outro";
  const motivoFinal = isOutro ? outroMotivo.trim() : motivo;
  const podeConfirmar = perda
    ? Boolean(novoStatus) && Boolean(motivoFinal)
    : Boolean(novoStatus);

  async function handleConfirm() {
    if (!podeConfirmar) return;
    setPending(true);
    const body = perda
      ? { status: novoStatus, motivoDesqualificacao: motivoFinal }
      : { status: novoStatus };
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
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

  // Ao trocar de status, limpa o motivo (evita arrastar motivo de seleção
  // anterior pra um status diferente).
  function handleStatusChange(v: string | null) {
    setNovoStatus(v ?? "");
    setMotivo("");
    setOutroMotivo("");
  }

  const simples = STATUS_SIMPLES.filter((s) => s !== statusAtual);
  const encerramentos = STATUS_ENCERRAMENTO.filter((s) => s !== statusAtual);

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
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="novo-status">Novo status</Label>
            <Select
              value={novoStatus}
              onValueChange={handleStatusChange}
              disabled={pending}
            >
              <SelectTrigger id="novo-status">
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {simples.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LEAD_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {incluirEncerramento && encerramentos.length > 0 && (
                  <SelectGroup>
                    <SelectSeparator />
                    <SelectLabel>Encerrar</SelectLabel>
                    {encerramentos.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LEAD_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          {perda && (
            <div className="space-y-2 rounded-md border border-destructive/25 bg-destructive/5 p-3">
              <Label>Motivo</Label>
              <Select
                value={motivo}
                onValueChange={(v) => setMotivo(v ?? "")}
                disabled={pending}
              >
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
              {isOutro && (
                <Textarea
                  value={outroMotivo}
                  onChange={(e) => setOutroMotivo(e.currentTarget.value)}
                  rows={2}
                  placeholder="Descreva o motivo"
                  disabled={pending}
                />
              )}
            </div>
          )}

          {!perda && (
            <p className="text-xs text-muted-foreground italic">
              Pra marcar como <strong>fechado</strong> (ganho), abra o detalhe
              do lead — pede banco, valor liberado e comissão.
            </p>
          )}
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
          <Button
            onClick={handleConfirm}
            disabled={pending || !podeConfirmar}
            variant={perda ? "destructive" : "default"}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Mudar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
