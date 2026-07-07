"use client";

import { Brush, Check, ExternalLink, Loader2, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/leads/status-badge";
import { Button } from "@/components/ui/button";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import type { Faxina } from "@/lib/minha-mesa/queries";

// FAXINA DO PIPELINE — decisões de 1 toque sobre os leads antigos parados
// (de antes do playbook executável). 20 por dia; em ~2 dias o backlog seca e
// este bloco desaparece pra sempre (a cadência + auto-perdido impedem volta).

type Props = { data: Faxina; readOnly?: boolean };

export function BlocoFaxina({ data, readOnly = false }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [decididos, setDecididos] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  const visiveis = data.itens.filter((i) => !decididos.has(i.leadId));
  if (data.restantes === 0 && visiveis.length === 0) return null;

  async function decidir(
    leadId: string,
    body: unknown,
    sucesso: string,
  ) {
    setPending(leadId);
    const res = await fetch(`/api/leads/${leadId}/cadencia`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não deu certo", { description: json.error ?? "Tente de novo." });
      return;
    }
    toast.success(sucesso);
    setDecididos((prev) => new Set(prev).add(leadId));
    startTransition(() => router.refresh());
  }

  const decididasNaSessao = decididos.size;
  const feitas = data.feitasHoje + decididasNaSessao;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Brush className="size-5 text-amber-500" strokeWidth={1.75} aria-hidden />
          <h2 className="font-display text-lg font-semibold">Faxina do pipeline</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            {feitas}/{data.quota} hoje · {Math.max(0, data.restantes - decididasNaSessao)} na fila
          </span>
        </div>
        <p className="font-serif italic text-xs text-muted-foreground">
          Esse lead ainda vale? Decida em 1 toque — pipeline limpo = foco em quem fecha.
        </p>
      </header>

      {visiveis.length === 0 ? (
        <div className="surface-solid rounded-xl p-5 text-center">
          <Check className="mx-auto size-6 text-emerald-500" strokeWidth={1.75} />
          <p className="mt-1 text-sm font-medium">
            Faxina de hoje concluída — o resto volta amanhã. 💪
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visiveis.map((item) => (
            <article
              key={item.leadId}
              className="surface-solid rounded-xl border-l-4 border-l-amber-400 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/leads/${item.leadId}`}
                      prefetch={false}
                      className="font-display text-base font-semibold leading-tight hover:underline truncate"
                    >
                      {item.leadNome}
                    </Link>
                    <StatusBadge status={item.status} className="shrink-0" />
                    <span className="font-mono text-xs tabular-nums font-medium">
                      {formatBrlFromCents(item.valorCreditoCentavos)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Parado há <span className="font-semibold text-foreground">{item.diasParado}d</span>
                    {item.ultimaInteracao && (
                      <> · último registro: “{item.ultimaInteracao}”</>
                    )}
                  </p>
                </div>
                <Link
                  href={`/leads/${item.leadId}`}
                  prefetch={false}
                  className="shrink-0 text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                >
                  <ExternalLink className="size-3.5" />
                  Ver lead
                </Link>
              </div>
              {readOnly ? null : (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  disabled={pending === item.leadId}
                  onClick={() =>
                    void decidir(
                      item.leadId,
                      { acao: "faxina_retomar" },
                      "Cadência retomada — volta pra sua fila amanhã.",
                    )
                  }
                  className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
                >
                  {pending === item.leadId ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Retomar cadência
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending === item.leadId}
                  onClick={() =>
                    void decidir(
                      item.leadId,
                      { acao: "decisao_perdido", faxina: true },
                      "Encerrado — pipeline mais limpo. 🎯",
                    )
                  }
                >
                  <X className="size-3.5" />
                  Perdido
                </Button>
              </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
