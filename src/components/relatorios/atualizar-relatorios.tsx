"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

// Botão "Atualizar dados" de /relatorios: os números se renovam sozinhos às
// 9h e às 18h (ver lib/reports/atualizacao.ts); aqui quem precisa de dado do
// minuto força o recálculo.

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AtualizarRelatorios({ atualizadoEm }: { atualizadoEm: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [recarregando, startTransition] = useTransition();
  const pending = enviando || recarregando;

  async function atualizar() {
    setEnviando(true);
    try {
      const res = await fetch("/api/relatorios/atualizar", { method: "POST" });
      if (!res.ok) {
        toast.error("Não foi possível atualizar os relatórios");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      toast.error("Erro de rede ao atualizar os relatórios");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground" title="Atualiza sozinho às 9h e às 18h">
        Dados de {hora(atualizadoEm)}
      </span>
      <Button variant="outline" size="sm" onClick={atualizar} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        {pending ? "Atualizando…" : "Atualizar dados"}
      </Button>
    </div>
  );
}
