"use client";

import { Check, ExternalLink, Gauge, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import type { SolicitacaoScorePendente } from "@/lib/minha-mesa/queries";

// Fila de aprovação do ADMIN: solicitações de consulta de score feitas pelos
// consultores (a consulta é paga — só admin executa). Aprovar consulta na hora
// (com dedup de 30d) e o score aparece no card do lead.

type Props = { items: SolicitacaoScorePendente[] };

export function BlocoSolicitacoesScore({ items }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [resolvidas, setResolvidas] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  const visiveis = items.filter((i) => !resolvidas.has(i.id));
  if (visiveis.length === 0) return null;

  async function resolver(id: string, acao: "aprovar" | "recusar") {
    setPending(`${id}:${acao}`);
    const res = await fetch(`/api/score/solicitacoes/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setPending(null);
    if (!res.ok) {
      toast.error("Não deu certo", { description: json.error ?? "Tente de novo." });
      return;
    }
    toast.success(acao === "aprovar" ? "Aprovado — score consultado." : "Recusada.");
    setResolvidas((prev) => new Set(prev).add(id));
    startTransition(() => router.refresh());
  }

  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <Gauge className="size-5 text-violet-500" strokeWidth={1.75} aria-hidden />
        <h2 className="font-display text-lg font-semibold">Solicitações de score</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
          {visiveis.length} pendente{visiveis.length > 1 ? "s" : ""} · consulta paga
        </span>
      </header>

      <div className="space-y-2">
        {visiveis.map((s) => (
          <article
            key={s.id}
            className="surface-solid rounded-xl border-l-4 border-l-violet-400 p-4"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/leads/${s.leadId}`}
                    prefetch={false}
                    className="font-display text-base font-semibold leading-tight hover:underline truncate"
                  >
                    {s.leadNome}
                  </Link>
                  <span className="font-mono text-xs tabular-nums font-medium">
                    {formatBrlFromCents(s.valorCreditoCentavos)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Solicitado por{" "}
                  <span className="font-medium text-foreground">{s.solicitanteNome}</span>{" "}
                  · {fmt.format(s.criadoEm)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  disabled={!!pending}
                  onClick={() => void resolver(s.id, "aprovar")}
                  className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
                >
                  {pending === `${s.id}:aprovar` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Aprovar e consultar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!pending}
                  onClick={() => void resolver(s.id, "recusar")}
                >
                  {pending === `${s.id}:recusar` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                  Recusar
                </Button>
                <Link
                  href={`/leads/${s.leadId}`}
                  prefetch={false}
                  className="ml-1 text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                >
                  <ExternalLink className="size-3.5" />
                  Ver lead
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
