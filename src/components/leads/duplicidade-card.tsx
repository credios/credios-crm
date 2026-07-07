"use client";

import { Check, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/leads/status-badge";
import { Button } from "@/components/ui/button";
import { maskCpf } from "@/lib/formatters/cpf-cnpj";

type Props = {
  dup: {
    id: string;
    cpf: string;
    criadoEm: string;
    novoId: string;
    novoNome: string;
    novoStatus: string;
    novoCriadoEm: string;
    existenteId: string;
    existenteNome: string;
    existenteStatus: string;
    existenteCriadoEm: string;
  };
};

const fmtData = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));

export function DuplicidadeCard({ dup }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);
  const [resolvida, setResolvida] = useState(false);

  async function resolver(resolucao: "manter_separado" | "descartar") {
    setPending(resolucao);
    const res = await fetch(`/api/duplicidades/${dup.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolucao }),
    });
    setPending(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não deu certo", { description: json.error ?? "Tente de novo." });
      return;
    }
    toast.success(resolucao === "manter_separado" ? "Mantidos separados." : "Aviso descartado.");
    setResolvida(true);
    startTransition(() => router.refresh());
  }

  if (resolvida) return null;

  return (
    <article className="surface-solid rounded-xl border-l-4 border-l-amber-400 p-4">
      <p className="font-mono text-xs text-muted-foreground mb-2">
        CPF {maskCpf(dup.cpf)} · detectada em {fmtData(dup.criadoEm)}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { rot: "Lead novo", id: dup.novoId, nome: dup.novoNome, status: dup.novoStatus, em: dup.novoCriadoEm },
          { rot: "Lead existente", id: dup.existenteId, nome: dup.existenteNome, status: dup.existenteStatus, em: dup.existenteCriadoEm },
        ].map((l) => (
          <div key={l.id} className="rounded-lg border border-foreground/10 p-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-fg-subtle">
              {l.rot} · {fmtData(l.em)}
            </p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Link
                href={`/leads/${l.id}`}
                prefetch={false}
                className="text-sm font-semibold hover:underline truncate"
              >
                {l.nome}
              </Link>
              <StatusBadge status={l.status} className="shrink-0" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          disabled={!!pending}
          onClick={() => void resolver("manter_separado")}
          className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
        >
          {pending === "manter_separado" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          São casos separados
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!pending}
          onClick={() => void resolver("descartar")}
        >
          {pending === "descartar" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <X className="size-3.5" />
          )}
          Descartar aviso
        </Button>
      </div>
    </article>
  );
}
