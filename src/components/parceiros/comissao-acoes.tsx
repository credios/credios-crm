"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Confirmar } from "@/components/shared/confirmar";
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
import { formatBrlFromCents } from "@/lib/formatters/currency";

// Ações do admin sobre UMA comissão: marcar "a pagar", pagar (data +
// comprovante opcional) e cancelar. Usado na ficha do parceiro e na página
// geral de comissões.

export type ComissaoAcao = {
  id: string;
  parceiroId: string;
  status: string;
  valorCentavos: number;
  rotulo: string;
  pixChave?: string | null;
  temComprovante?: boolean;
  temNota?: boolean;
};

function hojeIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function ComissaoAcoes({ c }: { c: ComissaoAcao }) {
  const router = useRouter();
  const [pagar, setPagar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pagoEm, setPagoEm] = useState(hojeIso());
  const [arquivo, setArquivo] = useState<File | null>(null);
  const base = `/api/parceiros/${c.parceiroId}/comissoes/${c.id}`;

  async function mudarStatus(status: "a_pagar" | "cancelada") {
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(json.error ?? "Não consegui atualizar.");
      throw new Error("falhou");
    }
    toast.success(status === "cancelada" ? "Comissão cancelada." : "Comissão marcada como a pagar.");
    router.refresh();
  }

  async function confirmarPagamento() {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("pagoEm", pagoEm);
      if (arquivo) form.set("comprovante", arquivo);
      const res = await fetch(`${base}/pagar`, { method: "POST", body: form });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(json.error ?? "Não consegui registrar o pagamento.");
      } else {
        toast.success("Pagamento registrado.");
        setPagar(false);
        router.refresh();
      }
    } catch {
      toast.error("Falha de conexão.");
    }
    setBusy(false);
  }

  const aberta = c.status === "prevista" || c.status === "a_pagar";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {c.temNota && (
        <a href={`${base}/arquivo?tipo=nota`} className="text-xs text-primary hover:underline">
          Nota fiscal
        </a>
      )}
      {c.temComprovante && (
        <a href={`${base}/arquivo?tipo=comprovante`} className="text-xs text-primary hover:underline">
          Comprovante
        </a>
      )}
      {c.status === "prevista" && (
        <Button variant="outline" size="sm" onClick={() => void mudarStatus("a_pagar").catch(() => {})}>
          A pagar
        </Button>
      )}
      {aberta && (
        <>
          <Button size="sm" onClick={() => setPagar(true)}>
            Registrar pagamento
          </Button>
          <Confirmar
            titulo="Cancelar esta comissão?"
            descricao={`${c.rotulo} — ${formatBrlFromCents(c.valorCentavos)}. A operação fica liberada para um novo registro.`}
            rotulo="Cancelar comissão"
            destrutivo
            onConfirmar={() => mudarStatus("cancelada")}
          >
            {(abrir) => (
              <Button variant="ghost" size="sm" onClick={abrir}>
                Cancelar
              </Button>
            )}
          </Confirmar>
        </>
      )}

      <Dialog open={pagar} onOpenChange={(o) => !busy && setPagar(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              {c.rotulo} — {formatBrlFromCents(c.valorCentavos)}
              {c.pixChave ? ` · PIX: ${c.pixChave}` : " · parceiro sem chave PIX cadastrada"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`pg-data-${c.id}`}>Data do pagamento</Label>
              <Input
                id={`pg-data-${c.id}`}
                type="date"
                value={pagoEm}
                max={hojeIso()}
                onChange={(e) => setPagoEm(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`pg-arq-${c.id}`}>Comprovante (opcional)</Label>
              <Input
                id={`pg-arq-${c.id}`}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                PDF, PNG ou JPG até 5 MB. O parceiro vê o comprovante no portal.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagar(false)} disabled={busy}>
              Voltar
            </Button>
            <Button onClick={() => void confirmarPagamento()} disabled={busy || !pagoEm}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
