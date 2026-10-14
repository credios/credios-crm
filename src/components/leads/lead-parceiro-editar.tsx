"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NENHUM = "__none__";

/** Admin/gerente define (ou troca) o parceiro que indicou o lead. Só entram
 *  na lista parceiros habilitados no produto do lead — a API confere de novo. */
export function LeadParceiroEditar({
  leadId,
  parceiroId,
  parceiros,
}: {
  leadId: string;
  parceiroId: string | null;
  parceiros: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [valor, setValor] = useState(parceiroId ?? NENHUM);
  const [busy, setBusy] = useState(false);
  const mudou = valor !== (parceiroId ?? NENHUM);

  async function salvar() {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parceiroId: valor === NENHUM ? null : valor }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) toast.error(typeof json.error === "string" ? json.error : "Não consegui salvar.");
      else {
        toast.success("Parceiro indicador atualizado.");
        router.refresh();
      }
    } catch {
      toast.error("Falha de conexão.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
      <div className="min-w-56 flex-1 space-y-1.5">
        <p className="text-sm font-medium">Parceiro que indicou</p>
        <Select value={valor} onValueChange={(v) => setValor(v ?? NENHUM)} disabled={busy}>
          <SelectTrigger>
            <SelectValue>
              {(v: unknown) =>
                typeof v === "string" && v !== NENHUM
                  ? (parceiros.find((p) => p.id === v)?.nome ?? "Parceiro")
                  : "Nenhum (não é indicação)"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NENHUM}>Nenhum (não é indicação)</SelectItem>
            {parceiros.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" disabled={busy || !mudou} onClick={() => void salvar()}>
        Salvar
      </Button>
    </div>
  );
}
