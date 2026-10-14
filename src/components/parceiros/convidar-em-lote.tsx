"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Confirmar } from "@/components/shared/confirmar";
import { Button } from "@/components/ui/button";

// Virada do portal: convida de uma vez os parceiros que já têm contrato
// assinado e ainda não têm login no portal novo. Admin only.
export function ConvidarEmLote({ quantidade }: { quantidade: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function convidar() {
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
      <Confirmar
        titulo={`Convidar ${quantidade} parceiro(s)?`}
        descricao="Cada um recebe um e-mail com o link para criar a senha do portal. O link vale por 7 dias."
        rotulo="Enviar convites"
        onConfirmar={convidar}
      >
        {(abrir) => (
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={abrir}>
            <Send className="size-4" /> {busy ? "Enviando…" : "Convidar todos"}
          </Button>
        )}
      </Confirmar>
    </div>
  );
}
