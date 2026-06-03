"use client";

import { Clock, Landmark, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { QuickActionsToolbar } from "@/components/minha-mesa/quick-actions-toolbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_PROPOSTA_BANCO_LABEL } from "@/lib/constants";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatLong, formatRelative } from "@/lib/formatters/date";
import type { CadenciaNivel, NegociacaoAberta } from "@/lib/negociacoes/queries";
import { cn } from "@/lib/utils";

const CADENCIA: Record<
  CadenciaNivel,
  { label: string; dot: string; text: string; border: string }
> = {
  urgente: {
    label: "Falar hoje",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-l-rose-500",
  },
  atencao: {
    label: "Atenção",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-l-amber-500",
  },
  ok: {
    label: "Em dia",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-l-emerald-500",
  },
};

const BANCO_STATUS_CLASS: Record<string, string> = {
  enviado: "bg-slate-500/12 text-slate-700 border-slate-500/25 dark:text-slate-300",
  em_analise: "bg-blue-500/12 text-blue-700 border-blue-500/25 dark:text-blue-300",
  aprovado:
    "bg-emerald-500/12 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  proposta_emitida:
    "bg-emerald-500/12 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  pendencia: "bg-amber-500/12 text-amber-800 border-amber-500/35 dark:text-amber-300",
  recusado: "bg-rose-500/12 text-rose-700 border-rose-500/25 dark:text-rose-300",
};

type Props = { items: NegociacaoAberta[]; mostrarConsultor?: boolean };

export function NegociacoesBoard({ items, mostrarConsultor = false }: Props) {
  const router = useRouter();

  const resumo = useMemo(() => {
    const valorTotal = items.reduce(
      (acc, i) => acc + (i.valorCreditoCentavos ?? 0),
      0,
    );
    const urgentes = items.filter((i) => i.cadencia === "urgente").length;
    return { total: items.length, valorTotal, urgentes };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-foreground/15 px-6 py-16 text-center space-y-2">
        <p className="font-display text-base font-semibold">
          Nenhuma negociação aberta
        </p>
        <p className="font-serif italic text-sm text-muted-foreground max-w-md mx-auto">
          Quando um lead avançar para <span className="not-italic font-medium">Em
          negociação</span>, ele aparece aqui — com o semáforo de contato, o
          status no banco e as ações do dia a dia à mão.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <ResumoChip label="Em negociação" valor={String(resumo.total)} />
        <ResumoChip label="Em jogo" valor={formatBrlFromCents(resumo.valorTotal)} />
        <ResumoChip
          label="Para falar hoje"
          valor={String(resumo.urgentes)}
          tone={resumo.urgentes > 0 ? "urgente" : "ok"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <NegociacaoCard
            key={item.leadId}
            item={item}
            mostrarConsultor={mostrarConsultor}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}

function ResumoChip({
  label,
  valor,
  tone,
}: {
  label: string;
  valor: string;
  tone?: "ok" | "urgente";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3 py-2",
        tone === "urgente" && "border-rose-500/30",
      )}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-lg font-semibold tabular-nums leading-tight",
          tone === "urgente" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {valor}
      </div>
    </div>
  );
}

function NegociacaoCard({
  item,
  mostrarConsultor,
  onChanged,
}: {
  item: NegociacaoAberta;
  mostrarConsultor: boolean;
  onChanged: () => void;
}) {
  const cad = CADENCIA[item.cadencia];

  return (
    <Card className={cn("border-l-4", cad.border)}>
      <CardContent className="space-y-3 p-4">
        {/* Nome + valor */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/leads/${item.leadId}`}
              prefetch={false}
              className="font-display text-base font-semibold leading-tight hover:underline break-words"
            >
              {item.leadNome}
            </Link>
            {mostrarConsultor && (
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <UserRound className="size-3" strokeWidth={1.75} />
                {item.consultorNome ?? "Pool · sem consultor"}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-semibold tabular-nums">
              {formatBrlFromCents(item.valorCreditoCentavos)}
            </div>
          </div>
        </div>

        {/* Semáforo de cadência */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2 rounded-full shrink-0", cad.dot)}
          />
          <span className={cn("text-xs font-semibold", cad.text)}>
            {cad.label}
          </span>
          <span
            className="text-xs text-muted-foreground"
            title={item.ultimoContato ? formatLong(item.ultimoContato) : undefined}
          >
            ·{" "}
            {item.ultimoContato
              ? `falou ${formatRelative(item.ultimoContato)}`
              : "sem contato registrado"}
          </span>
        </div>

        {/* Tempo em negociação + local/origem */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle font-mono">
          {item.diasEmNegociacao != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" strokeWidth={1.75} />
              em negociação há {item.diasEmNegociacao}d
            </span>
          )}
          {(item.cidade || item.estado) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" strokeWidth={1.75} />
              {item.cidade && item.estado
                ? `${item.cidade}, ${item.estado}`
                : (item.cidade ?? item.estado)}
            </span>
          )}
          {item.origem && <span>{item.origem}</span>}
        </div>

        {/* Bancos / propostas */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-foreground/5 pt-3">
          <Landmark
            className="size-3.5 text-muted-foreground shrink-0"
            strokeWidth={1.75}
          />
          {item.bancos.length === 0 ? (
            <span className="text-[11px] text-fg-subtle italic">
              Nenhum banco vinculado
            </span>
          ) : (
            item.bancos.map((b) => (
              <Badge
                key={`${b.banco}-${b.status}`}
                variant="outline"
                className={cn(
                  "text-[10px] font-medium",
                  BANCO_STATUS_CLASS[b.status] ??
                    "bg-muted text-muted-foreground border-border",
                )}
              >
                {b.banco} · {STATUS_PROPOSTA_BANCO_LABEL[b.status] ?? b.status}
              </Badge>
            ))
          )}
        </div>

        {/* Ações rápidas */}
        <div className="pt-0.5">
          <QuickActionsToolbar
            item={item}
            onResolved={onChanged}
            allowEncerrar
          />
        </div>
      </CardContent>
    </Card>
  );
}
