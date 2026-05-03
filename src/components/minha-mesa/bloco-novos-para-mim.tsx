import { Inbox, MessageCircle } from "lucide-react";
import Link from "next/link";

import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatPhoneBr, whatsappUrl } from "@/lib/formatters/phone";
import type { NovoParaMim } from "@/lib/minha-mesa/queries";
import { cn } from "@/lib/utils";

type Props = { items: NovoParaMim[] };

export function BlocoNovosParaMim({ items }: Props) {
  return (
    <section className="surface-solid rounded-xl p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-blue-500" strokeWidth={1.75} />
          <h2 className="font-display text-base font-semibold">Novos pra mim</h2>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
          últimas 24h · {items.length}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          Nenhum lead novo nas últimas 24h.
        </p>
      ) : (
        <ul className="divide-y divide-foreground/5">
          {items.map((l) => {
            const wp = whatsappUrl(l.whatsapp);
            const sla = l.slaPercentDecorrido;
            const slaTone =
              sla >= 100
                ? "text-destructive font-bold"
                : sla >= 70
                  ? "text-amber-700 dark:text-amber-300 font-semibold"
                  : "text-emerald-700 dark:text-emerald-300";
            return (
              <li key={l.leadId} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/leads/${l.leadId}`}
                      prefetch={false}
                      className="text-sm font-semibold hover:underline truncate block"
                    >
                      {l.leadNome}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span className="font-mono tabular-nums font-medium text-foreground">
                        {formatBrlFromCents(l.valorCreditoCentavos)}
                      </span>
                      {l.origem && (
                        <>
                          <span className="text-foreground/20">·</span>
                          <span>{l.origem}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn("font-mono text-xs tabular-nums", slaTone)}>
                      {l.minutosDesdeAtribuicao < 60
                        ? `${l.minutosDesdeAtribuicao}min`
                        : `${Math.floor(l.minutosDesdeAtribuicao / 60)}h${l.minutosDesdeAtribuicao % 60 > 0 ? ` ${l.minutosDesdeAtribuicao % 60}min` : ""}`}
                    </div>
                    <div className="text-[10px] text-fg-subtle font-mono uppercase tracking-wider">
                      {sla >= 100 ? "SLA estourado" : `${sla}% do SLA`}
                    </div>
                  </div>
                </div>
                {wp && (
                  <a
                    href={wp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 hover:underline"
                  >
                    <MessageCircle className="size-3" />
                    {formatPhoneBr(l.whatsapp)}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
