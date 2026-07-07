import { ListChecks } from "lucide-react";

import type { DisciplinaFollowup } from "@/lib/cadencia/metricas";

// Bloco "Disciplina de follow-up" (30 dias) — o placar do playbook executável.
// Server component simples: tiles de contagem, sem interação.

export function DisciplinaFollowupCard({ data }: { data: DisciplinaFollowup }) {
  const tiles: Array<{ label: string; value: number; tone?: "good" | "bad" }> = [
    { label: "Reuniões marcadas", value: data.reunioesMarcadas },
    { label: "Realizadas", value: data.reunioesRealizadas, tone: "good" },
    { label: "No-show", value: data.reunioesNoShow, tone: data.reunioesNoShow > 0 ? "bad" : undefined },
    { label: "Mensagens de cadência", value: data.mensagensCadencia },
    { label: "Ligações de cadência", value: data.ligacoesCadencia },
    { label: "Decisões tomadas", value: data.decisoesTomadas, tone: "good" },
    { label: "Auto-perdidos", value: data.autoPerdidos, tone: data.autoPerdidos > 0 ? "bad" : undefined },
  ];

  return (
    <section className="surface-solid rounded-xl p-4">
      <header className="mb-3 flex items-center gap-2">
        <ListChecks className="size-4.5 text-primary" strokeWidth={1.75} aria-hidden />
        <h2 className="font-display text-base font-semibold">Disciplina de follow-up</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
          últimos 30 dias
        </span>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border p-2.5 text-center">
            <div
              className={`font-mono text-xl font-semibold tabular-nums ${
                t.tone === "good" && t.value > 0
                  ? "text-emerald-600"
                  : t.tone === "bad"
                    ? "text-destructive"
                    : "text-foreground"
              }`}
            >
              {t.value}
            </div>
            <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
              {t.label}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 font-serif italic text-xs text-muted-foreground">
        Auto-perdido = a decisão de fim de cadência ficou 7 dias sem resposta e o sistema
        encerrou sozinho. O objetivo é ZERO — decida você antes.
      </p>
    </section>
  );
}
