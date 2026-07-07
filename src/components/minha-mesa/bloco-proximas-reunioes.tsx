import { CalendarClock, Video } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/leads/status-badge";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import type { ProximaReuniao } from "@/lib/minha-mesa/queries";
import { cn } from "@/lib/utils";

// PRÓXIMAS REUNIÕES — todos os compromissos agendados e ainda por acontecer
// do consultor, na ordem em que vão acontecer. Só leitura por natureza (a
// ação sobre a reunião é o desfecho, que vira card na fila quando ela passa).

type Props = { items: ProximaReuniao[] };

const FMT_DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

export function BlocoProximasReunioes({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="surface-solid rounded-xl p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-violet-500" strokeWidth={1.75} />
          <h2 className="font-display text-base font-semibold">Próximas reuniões</h2>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
          {items.length} agendada{items.length > 1 ? "s" : ""}
        </span>
      </header>

      <ul className="divide-y divide-foreground/5">
        {items.map((r) => (
          <li key={r.reuniaoId} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1 text-center font-mono tabular-nums",
                    r.hoje
                      ? "bg-violet-600 text-white"
                      : "bg-foreground/5 text-foreground",
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider leading-tight opacity-80">
                    {r.hoje ? "hoje" : FMT_DIA.format(r.inicio)}
                  </div>
                  <div className="text-sm font-semibold leading-tight">
                    {FMT_HORA.format(r.inicio)}
                  </div>
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/leads/${r.leadId}`}
                    prefetch={false}
                    className="text-sm font-semibold hover:underline truncate block"
                  >
                    {r.leadNome}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono tabular-nums font-medium text-foreground">
                      {formatBrlFromCents(r.valorCreditoCentavos)}
                    </span>
                    <StatusBadge status={r.leadStatus} className="shrink-0" />
                  </div>
                </div>
              </div>
              {r.meetLink && (
                <a
                  href={r.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:underline"
                >
                  <Video className="size-3.5" />
                  Entrar no Meet
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
