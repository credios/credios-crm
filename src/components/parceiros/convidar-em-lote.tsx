"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

// Virada do portal: convida de uma vez os parceiros que já têm contrato
// assinado e ainda não têm login no portal novo. Admin only.
export function ConvidarEmLote({ quantidade }: { quantidade: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function convidar() {
    if (
      !window.confirm(
        `Enviar convite por e-mail para ${quantidade} parceiro(s) criarem a senha do portal?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/parceiros/convidar-portal-em-lote", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { enviados: number; falhas: { nome: string; erro: string }[] };
        error?: string;
      };
      if (!res.ok || !json.data) toast.error(json.error ?? "Não consegui enviar os convites.");
      else if (json.data.falhas.length > 0) {
        toast.warning(
          `${json.data.enviados} convite(s) enviado(s); falhou: ${json.data.falhas
            .map((f) => f.nome)
            .join(", ")}.`,
        );
      } else toast.success(`${json.data.enviados} convite(s) enviado(s).`);
      router.refresh();
    } catch {
      toast.error("Falha de conexão.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <p className="text-sm">
        <strong>{quantidade}</strong> parceiro(s) com contrato assinado ainda não têm login
        no portal.
      </p>
      <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void convidar()}>
        <Send className="size-4" /> {busy ? "Enviando…" : "Convidar todos"}
      </Button>
    </div>
  );
}
