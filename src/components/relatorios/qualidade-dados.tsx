"use client";

import { AlertTriangle, Check, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import type { LeadDadoAtipico } from "@/lib/reports/queries";

// Alerta de QUALIDADE DE DADOS nos relatórios: leads do período com valores
// possivelmente errados (zeros a mais etc.) que entram nas médias. Admin
// confirma ("está correto mesmo") ou abre o lead pra corrigir — corrigiu,
// o alerta some sozinho na próxima carga.

type Props = { items: LeadDadoAtipico[] };

export function QualidadeDadosBanner({ items }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  const visiveis = items.filter((i) => !resolvidos.has(i.leadId));
  if (visiveis.length === 0) return null;

  async function confirmar(leadId: string) {
    setPending(leadId);
    const res = await fetch(`/api/leads/${leadId}/confirmar-valores`, { method: "POST" });
    setPending(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não deu certo", { description: json.error ?? "Tente de novo." });
      return;
    }
    toast.success("Valores confirmados — o alerta some dos relatórios.");
    setResolvidos((prev) => new Set(prev).add(leadId));
    startTransition(() => router.refresh());
  }

  const mostrados = aberto ? visiveis : visiveis.slice(0, 3);

  return (
    <section className="surface-solid rounded-xl border-l-4 border-l-amber-400 p-4 space-y-3">
      <header className="flex items-center gap-2 flex-wrap">
        <AlertTriangle className="size-4 text-amber-500" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold">
          {visiveis.length} lead{visiveis.length > 1 ? "s" : ""} com valores possivelmente
          errados nestes números
        </h2>
        <span className="text-xs text-muted-foreground">
          — confirme ou corrija pra manter os relatórios precisos
        </span>
      </header>

      <ul className="space-y-2">
        {mostrados.map((l) => (
          <li
            key={l.leadId}
            className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-amber-500/5 px-3 py-2"
          >
            <div className="min-w-0 text-sm">
              <Link
                href={`/leads/${l.leadId}`}
                prefetch={false}
                className="font-semibold hover:underline"
              >
                {l.nome}
              </Link>
              <span className="ml-2 text-xs text-amber-700 dark:text-amber-300 font-medium">
                {l.motivos.join(" · ")}
              </span>
              <span className="block text-xs text-muted-foreground font-mono tabular-nums">
                {[
                  l.rendaMensalCentavos != null
                    ? `renda ${formatBrlFromCents(l.rendaMensalCentavos)}`
                    : null,
                  l.valorCreditoCentavos != null
                    ? `crédito ${formatBrlFromCents(l.valorCreditoCentavos)}`
                    : null,
                  l.valorImovelCentavos != null
                    ? `imóvel ${formatBrlFromCents(l.valorImovelCentavos)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                disabled={!!pending}
                onClick={() => void confirmar(l.leadId)}
              >
                {pending === l.leadId ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Está correto
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(`/leads/${l.leadId}`, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="size-3.5" />
                Corrigir
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {visiveis.length > 3 && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {aberto ? "Mostrar menos" : `Ver todos os ${visiveis.length}`}
        </button>
      )}
    </section>
  );
}
