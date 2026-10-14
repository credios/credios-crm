"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskCpf } from "@/lib/formatters/cpf-cnpj";
import { cn } from "@/lib/utils";

// Assinatura do contrato pelo parceiro, em 3 passos visíveis: ler → confirmar
// o código → assinar. Toda chamada leva o ID do contrato que está na tela.

async function postar(url: string, body: unknown) {
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

const PASSOS = ["Ler o contrato", "Confirmar o código", "Assinar"] as const;

function Passos({ atual }: { atual: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Etapas da assinatura">
      {PASSOS.map((p, i) => (
        <li key={p} className="flex items-center gap-2 text-sm" aria-current={i === atual ? "step" : undefined}>
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full border text-xs font-semibold",
              i < atual && "border-emerald-600 bg-emerald-600 text-white",
              i === atual && "border-primary bg-primary text-primary-foreground",
              i > atual && "border-border text-muted-foreground",
            )}
          >
            {i < atual ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={i === atual ? "font-medium" : "text-muted-foreground"}>{p}</span>
        </li>
      ))}
    </ol>
  );
}

export function ContratoAssinar({
  contratoId,
  email,
  jaVerificado,
}: {
  contratoId: string;
  email: string;
  jaVerificado: boolean;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState(jaVerificado ? 2 : 0);
  const [codigo, setCodigo] = useState("");
  const [aceito, setAceito] = useState(false);
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // "Contrato aberto" entra na trilha só quando a página é exibida de fato.
  useEffect(() => {
    void postar("/api/portal-parceiro/contrato/visualizado", { contratoId });
  }, [contratoId]);

  async function rodar(
    fn: () => Promise<{ ok: true } | { ok: false; erro: string }>,
    depois: () => void,
  ) {
    setErro(null);
    setPending(true);
    const r = await fn();
    setPending(false);
    if (!r.ok) {
      setErro(r.erro);
      // Código vencido (10 min) ou confirmação vencida (15 min): volta pro
      // passo de pedir código, em vez de deixar o botão de assinar inútil.
      if (/c[oó]digo/i.test(r.erro) && /expir/i.test(r.erro)) {
        setCodigo("");
        setAceito(false);
        setEtapa(0);
      }
      // Contrato mudou enquanto a página estava aberta: recarrega o texto novo.
      if (/foi atualizado/i.test(r.erro)) router.refresh();
      return;
    }
    depois();
  }

  const pedirCodigo = () => postar("/api/portal-parceiro/contrato/codigo", { contratoId });

  return (
    <section
      aria-label="Assinatura"
      className="sticky bottom-0 z-20 -mx-4 space-y-4 border-t bg-card/95 px-4 py-4 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur sm:mx-0 sm:rounded-xl sm:border"
    >
      <Passos atual={etapa} />
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {etapa === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Depois de ler, enviamos um código de 6 dígitos para{" "}
            <strong className="text-foreground">{email}</strong>.
          </p>
          <Button disabled={pending} onClick={() => void rodar(pedirCodigo, () => setEtapa(1))}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Li o contrato — enviar código
          </Button>
        </div>
      )}

      {etapa === 1 && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void rodar(
              () => postar("/api/portal-parceiro/contrato/verificar", { contratoId, codigo }),
              () => setEtapa(2),
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ct-codigo">Código enviado para {email}</Label>
            <Input
              id="ct-codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              className="w-40 text-center text-lg tracking-[0.4em]"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending || codigo.length !== 6}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Conferir código
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => void rodar(pedirCodigo, () => setCodigo(""))}
          >
            Reenviar
          </Button>
          <p className="w-full text-[11px] text-muted-foreground">O código vale por 10 minutos.</p>
        </form>
      )}

      {etapa === 2 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex max-w-xl items-start gap-2 text-sm leading-snug cursor-pointer">
            <Checkbox
              aria-label="Li o contrato, concordo com todas as cláusulas e assino eletronicamente"
              checked={aceito}
              onCheckedChange={(v) => setAceito(v === true)}
              disabled={pending}
              className="mt-0.5"
            />
            <span>
              Li o contrato de parceria acima, concordo com todas as cláusulas e assino
              eletronicamente.
            </span>
          </label>
          <Button
            disabled={pending || !aceito}
            onClick={() =>
              void rodar(
                () => postar("/api/portal-parceiro/contrato/assinar", { contratoId, aceito: true }),
                () => {
                  router.replace("/portal-parceiro/contrato?assinado=1");
                  router.refresh();
                },
              )
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Assinar contrato
          </Button>
        </div>
      )}
    </section>
  );
}

/** Parceiro PJ: quem assina pela empresa. Sem isso o contrato não é gerado. */
export function RepresentanteForm({ nomeSugerido }: { nomeSugerido: string }) {
  const router = useRouter();
  const [nome, setNome] = useState(nomeSugerido);
  const [cpf, setCpf] = useState("");
  const [declaro, setDeclaro] = useState(false);
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!declaro) return setErro("Confirme que você tem poderes para assinar pela empresa.");
    setPending(true);
    const r = await postar("/api/portal-parceiro/contrato/representante", {
      nome,
      cpf,
      declaroPoderes: true,
    });
    setPending(false);
    if (!r.ok) return setErro(r.erro);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4 rounded-xl border bg-card p-5" noValidate>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="rp-nome">Nome completo de quem assina</Label>
        <Input id="rp-nome" value={nome} onChange={(e) => setNome(e.target.value)} disabled={pending} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rp-cpf">CPF</Label>
        <Input
          id="rp-cpf"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => setCpf(maskCpf(e.target.value))}
          disabled={pending}
        />
      </div>
      <label className="flex items-start gap-2 text-sm leading-snug cursor-pointer">
        <Checkbox
          aria-label="Declaro ter poderes para assinar pela empresa"
          checked={declaro}
          onCheckedChange={(v) => setDeclaro(v === true)}
          disabled={pending}
          className="mt-0.5"
        />
        <span>
          Declaro que sou representante legal ou procurador da empresa, com poderes para
          assinar contratos em nome dela.
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Continuar para o contrato
      </Button>
    </form>
  );
}
