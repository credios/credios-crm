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
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome: string;
  onSuccess: () => void;
};

export function NotaRapidaDialog({
  open,
  onOpenChange,
  leadId,
  leadNome,
  onSuccess,
}: Props) {
  const [conteudo, setConteudo] = useState("");
  const [pending, setPending] = useState(false);

  function reset() {
    setConteudo("");
  }

  async function handleConfirm() {
    const txt = conteudo.trim();
    if (!txt) {
      toast.error("Escreva alguma coisa");
      return;
    }
    setPending(true);
    // Anotações vivem em `lead_anotacoes` (migration 0020) — a partir da 0021
    // não entram mais na timeline de interações. Por isso o POST vai pro
    // endpoint de anotações, não pro de interações (onde o tipo "anotacao"
    // é rejeitado de propósito).
    const res = await fetch(`/api/leads/${leadId}/anotacoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conteudo: txt }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não consegui salvar", {
        description:
          typeof json.error === "string" ? json.error : `Falha ${res.status}`,
      });
      return;
    }
    toast.success("Anotação salva");
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
          <DialogTitle>Anotação rápida</DialogTitle>
          <DialogDescription>
            Lead: <strong>{leadNome}</strong>. A anotação aparece na aba
            Anotações do lead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="nota-conteudo">Anotação</Label>
          <Textarea
            id="nota-conteudo"
            rows={4}
            value={conteudo}
            onChange={(e) => setConteudo(e.currentTarget.value)}
            disabled={pending}
            placeholder="O que aconteceu? Resposta do banco, pedido do cliente, próximo passo…"
            autoFocus
          />
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
          <Button onClick={handleConfirm} disabled={pending || !conteudo.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
