"use client";

import { Loader2, UserPlus } from "lucide-react";
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

type Consultor = { id: string; nome: string };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
  consultores: Consultor[];
  /** Chamado quando atribuição confirmada com sucesso (UI otimista). */
  onSuccess: (consultor: Consultor) => void;
};

export function AtribuirDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  consultores,
  onSuccess,
}: Props) {
  const [consultorId, setConsultorId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setConsultorId("");
    setError(null);
  }

  async function handleConfirm() {
    setError(null);
    if (!consultorId) {
      setError("Selecione um consultor");
      return;
    }
    const target = consultores.find((c) => c.id === consultorId);
    if (!target) {
      setError("Consultor inválido");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/atribuicao`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consultorId }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        typeof json.error === "string" ? json.error : `Falha (${res.status})`,
      );
      return;
    }
    toast.success(`Atribuído a ${target.nome}`);
    reset();
    onSuccess(target);
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
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-primary" />
            Qualificar e atribuir
          </DialogTitle>
          <DialogDescription>
            Lead: <strong>{leadNome}</strong>. Escolha o consultor que
            vai atender.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="consultor">Consultor</Label>
            <Select
              value={consultorId}
              onValueChange={(v) => setConsultorId(v ?? "")}
              disabled={pending}
            >
              <SelectTrigger id="consultor">
                <SelectValue placeholder="Escolha um consultor" />
              </SelectTrigger>
              <SelectContent>
                {consultores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
          <Button onClick={handleConfirm} disabled={pending || !consultorId}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
