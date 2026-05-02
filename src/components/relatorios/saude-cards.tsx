import { AlertTriangle, ListChecks } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Props = {
  esfriando: number;
  slaAtrasado: number;
  aguardandoAcao: number;
  /** Pré-filtro pra cada link "Ver lista". Atualmente é o consultor visualizado. */
  consultorId?: string;
};

function tone(n: number): "ok" | "watch" | "alert" {
  if (n === 0) return "ok";
  if (n <= 3) return "watch";
  return "alert";
}

const TONE_CLS: Record<"ok" | "watch" | "alert", string> = {
  ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  watch: "border-gold-500/30 bg-gold-500/5 text-gold-800 dark:text-gold-300",
  alert: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300",
};

export function SaudeCards({
  esfriando,
  slaAtrasado,
  aguardandoAcao,
  consultorId,
}: Props) {
  const cards = [
    {
      key: "esfriando",
      label: "Esfriando",
      hint: "ativos sem interação 5+ dias",
      icon: AlertTriangle,
      n: esfriando,
      filter: { ultimoContato: "esfriando" },
    },
    {
      key: "sla",
      label: "SLA atrasado",
      hint: "novos sem 1º contato em 30min",
      icon: AlertTriangle,
      n: slaAtrasado,
      filter: { sla: "atrasado" },
    },
    {
      key: "acao",
      label: "Aguardando minha ação",
      hint: "novos > 2h, sem resposta 24h+, doc 5d+",
      icon: ListChecks,
      n: aguardandoAcao,
      filter: { acao: "pendente" },
    },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => {
        const t = tone(c.n);
        const Icon = c.icon;
        const params = new URLSearchParams();
        if (consultorId) params.set("consultorId", consultorId);
        for (const [k, v] of Object.entries(c.filter)) params.set(k, v);
        const href = `/leads?${params.toString()}`;
        return (
          <div
            key={c.key}
            className={cn(
              "relative rounded-xl border p-4 transition-shadow duration-base",
              TONE_CLS[t],
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
                  {c.label}
                </p>
                <p className="font-display text-3xl font-semibold tabular-nums leading-none">
                  {c.n}
                </p>
                <p className="text-xs opacity-80 mt-1.5">{c.hint}</p>
              </div>
              <Icon
                className="size-5 opacity-70"
                strokeWidth={1.75}
                aria-hidden
              />
            </div>
            {c.n > 0 && (
              <Link
                href={href}
                className="mt-3 inline-block text-xs font-medium underline underline-offset-2 hover:opacity-80"
              >
                Ver lista →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
