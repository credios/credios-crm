"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Assinatura do contrato pelo parceiro: ler → pedir código → conferir → assinar.

async function postar(url: string, body: unknown = {}) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true as const };
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false as const, erro: json.error ?? "Não foi possível concluir." };
  } catch {
    return { ok: false as const, erro: "Falha de conexão. Tente de novo." };
  }
}

export function ContratoAssinar({
  email,
  jaVerificado,
}: {
  email: string;
  jaVerificado: boolean;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<"ler" | "codigo" | "assinar">(
    jaVerificado ? "assinar" : "ler",
  );
  const [codigo, setCodigo] = useState("");
  const [aceito, setAceito] = useState(false);
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar(fn: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois: () => void) {
    setErro(null);
    setPending(true);
    const r = await fn();
    setPending(false);
    if (!r.ok) return setErro(r.erro);
    depois();
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {etapa === "ler" && (
        <>
          <p className="text-sm text-muted-foreground">
            Leu o contrato? Para assinar, enviamos um código de 6 dígitos para{" "}
            <strong className="text-foreground">{email}</strong>.
          </p>
          <Button
            disabled={pending}
            onClick={() =>
              void rodar(() => postar("/api/portal-parceiro/contrato/codigo"), () => setEtapa("codigo"))
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Enviar código por e-mail
          </Button>
        </>
      )}

      {etapa === "codigo" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void rodar(
              () => postar("/api/portal-parceiro/contrato/verificar", { codigo }),
              () => setEtapa("assinar"),
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ct-codigo">Código enviado para {email}</Label>
            <Input
              id="ct-codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="max-w-40 text-center text-lg tracking-[0.4em]"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              disabled={pending}
            />
            <p className="text-[11px] text-muted-foreground">Vale por 10 minutos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || codigo.length !== 6}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Conferir código
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                void rodar(() => postar("/api/portal-parceiro/contrato/codigo"), () => setCodigo(""))
              }
            >
              Reenviar código
            </Button>
          </div>
        </form>
      )}

      {etapa === "assinar" && (
        <>
          <label className="flex items-start gap-2 text-sm leading-snug cursor-pointer">
            <Checkbox checked={aceito} onCheckedChange={(v) => setAceito(v === true)} disabled={pending} className="mt-0.5" />
            <span>
              Li o contrato de parceria acima, concordo com todas as cláusulas e assino
              eletronicamente.
            </span>
          </label>
          <Button
            disabled={pending || !aceito}
            onClick={() =>
              void rodar(
                () => postar("/api/portal-parceiro/contrato/assinar", { aceito: true }),
                () => {
                  router.replace("/portal-parceiro");
                  router.refresh();
                },
              )
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Assinar contrato
          </Button>
        </>
      )}
    </div>
  );
}
