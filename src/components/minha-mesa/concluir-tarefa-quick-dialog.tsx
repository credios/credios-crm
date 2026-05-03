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
import { Textarea } from "@/components/ui/textarea";
import { ACAO_TAREFA_LABEL } from "@/lib/constants";

const ACOES = [
  "liguei",
  "enviei_whatsapp",
  "recebi_resposta",
  "cobrei_documentacao",
  "atualizei_retorno_banco",
  "atualizei_banco_parceiro",
  "cliente_pediu_retorno",
  "nao_consegui_contato",
  "outro",
] as const;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tarefaId: string;
  leadNome: string;
  onSuccess: () => void;
};

export function ConcluirTarefaQuickDialog({
  open,
  onOpenChange,
  tarefaId,
  leadNome,
  onSuccess,
}: Props) {
  const [acao, setAcao] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [pending, setPending] = useState(false);

  const isOutro = acao === "outro";

  function reset() {
    setAcao("");
    setObservacao("");
  }

  async function handleConfirm() {
    if (!acao) {
      toast.error("Escolha o que foi feito");
      return;
    }
    if (isOutro && !observacao.trim()) {
      toast.error('Descreva o "outro"');
      return;
    }
    setPending(true);
    const res = await fetch(`/api/tarefas/${tarefaId}/concluir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        acao,
        observacao: observacao.trim() || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não consegui concluir", {
        description:
          typeof json.error === "string" ? json.error : `Falha ${res.status}`,
      });
      return;
    }
    toast.success("Tarefa concluída");
    reset();
    onSuccess();
  }

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
          <DialogTitle>Concluir tarefa</DialogTitle>
          <DialogDescription>
            Lead: <strong>{leadNome}</strong>. O que você fez?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="acao">Ação</Label>
            <Select
              value={acao}
              onValueChange={(v) => setAcao(v ?? "")}
              disabled={pending}
            >
              <SelectTrigger id="acao">
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {ACOES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {ACAO_TAREFA_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs">
              Observação{isOutro ? "" : " (opcional)"}
            </Label>
            <Textarea
              id="obs"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.currentTarget.value)}
              disabled={pending}
              placeholder="Algum detalhe relevante…"
            />
          </div>
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
            disabled={pending || !acao || (isOutro && !observacao.trim())}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
