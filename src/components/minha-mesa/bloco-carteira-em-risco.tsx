import { Snowflake } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/leads/status-badge";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import type { CarteiraEmRisco } from "@/lib/minha-mesa/queries";

type Props = { items: CarteiraEmRisco[] };

export function BlocoCarteiraEmRisco({ items }: Props) {
  return (
    <section className="surface-solid rounded-xl p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Snowflake className="size-4 text-amber-500" strokeWidth={1.75} />
          <h2 className="font-display text-base font-semibold">
            Carteira em risco
          </h2>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
          esfriando · {items.length}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          Carteira em dia. Tudo com contato recente.
        </p>
      ) : (
        <ul className="divide-y divide-foreground/5">
          {items.map((l) => (
            <li key={l.leadId} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/leads/${l.leadId}`}
                      prefetch={false}
                      className="text-sm font-semibold hover:underline truncate"
                    >
                      {l.leadNome}
                    </Link>
                    <StatusBadge status={l.status} className="shrink-0 text-[10px]" />
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    {l.motivo}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs tabular-nums font-medium">
                    {formatBrlFromCents(l.valorCreditoCentavos)}
                  </div>
                  {(l.cidade || l.estado) && (
                    <div className="text-[10px] text-fg-subtle font-mono mt-0.5">
                      {l.cidade && l.estado
                        ? `${l.cidade}, ${l.estado}`
                        : l.cidade ?? l.estado}
                    </div>
                  )}
                  {l.origem && (
                    <div className="text-[10px] text-fg-subtle font-mono mt-0.5">
                      {l.origem}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
