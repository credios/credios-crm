"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/** Parceiro anexa (ou troca) a nota fiscal de uma comissão. */
export function EnviarNotaFiscal({ comissaoId, jaTem }: { comissaoId: string; jaTem: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    setErro(null);
    setPending(true);
    try {
      const form = new FormData();
      form.set("nota", arquivo);
      const res = await fetch(`/api/portal-parceiro/comissoes/${comissaoId}/nota`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setErro(json.error ?? "Não foi possível enviar.");
      } else router.refresh();
    } catch {
      setErro("Falha de conexão.");
    }
    setPending(false);
    if (input.current) input.current.value = "";
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="sr-only"
        aria-label="Arquivo da nota fiscal"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void enviar(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {jaTem ? "Trocar nota fiscal" : "Enviar nota fiscal"}
      </Button>
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </span>
  );
}
