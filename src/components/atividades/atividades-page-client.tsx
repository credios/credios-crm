/* eslint-disable react-hooks/set-state-in-effect */
// Inicialização de Date.now() na primeira execução do efeito + ticker em
// setInterval. Padrão "subscribe to external system" (relógio), o linter
// não distingue.
"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { AtividadesFilters } from "./atividades-filters";
import { AtividadesKpiCards } from "./atividades-kpi-cards";
import { AtividadesTimeline } from "./atividades-timeline";
import { Button } from "@/components/ui/button";
import type { AtividadesFilters as Filters } from "@/lib/atividades/filters";
import type { Atividade, AtividadesKpi } from "@/lib/atividades/types";

type Props = {
  initialAtividades: Atividade[];
  initialKpis: AtividadesKpi[];
  consultores: { id: string; nome: string }[];
  filters: Filters;
};

export function AtividadesPageClient({
  initialAtividades,
  initialKpis,
  consultores,
  filters,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Tempo do último refresh. Usamos epoch ms (number) pra facilitar diff
  // sem comparar Date objects. Inicial pode ser 0 — o ticker abaixo já
  // atualiza no mount; antes disso o relativeTime mostra "agora".
  const [lastRefreshed, setLastRefreshed] = useState<number>(0);
  const [tickNow, setTickNow] = useState<number>(0);

  // Refresh manual + on visibility change.
  //   - visibilitychange: usuário voltou pra aba depois do almoço → fresh data
  //   - manual: botão "Recarregar" + atualiza lastRefreshed
  // Sem auto-poll (decisão do owner) — menos surpresa pra quem está olhando
  // uma atividade específica.
  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setLastRefreshed(Date.now());
    });
  }, [router]);

  useEffect(() => {
    // Inicializa lastRefreshed e tickNow no mount (client-only).
    const now = Date.now();
    setLastRefreshed(now);
    setTickNow(now);

    function onVisibility() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    // Tick a cada 30s pra "há X min" atualizar sem refresh do server.
    const tickInterval = setInterval(() => setTickNow(Date.now()), 30_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(tickInterval);
    };
  }, [refresh]);

  return (
    <div className="space-y-5">
      <AtividadesFilters consultores={consultores} filters={filters} />

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {initialAtividades.length}{" "}
          {initialAtividades.length === 1 ? "atividade" : "atividades"} no
          período · atualizado{" "}
          <RelativeTime fromEpochMs={lastRefreshed} nowEpochMs={tickNow} />
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={isPending}
          className="h-7 gap-1.5"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Recarregar
        </Button>
      </div>

      <AtividadesKpiCards kpis={initialKpis} />

      <AtividadesTimeline atividades={initialAtividades} />
    </div>
  );
}

// Componente puro: recebe `from` e `now` como epoch ms (pai mantém ticker).
// Pré-hidratação ambos ficam 0 → mostra "agora".
function RelativeTime({
  fromEpochMs,
  nowEpochMs,
}: {
  fromEpochMs: number;
  nowEpochMs: number;
}) {
  if (fromEpochMs === 0 || nowEpochMs === 0) return <span>agora</span>;
  const diffSec = Math.floor((nowEpochMs - fromEpochMs) / 1000);
  if (diffSec < 10) return <span>agora</span>;
  if (diffSec < 60) return <span>há {diffSec}s</span>;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return <span>há {min}min</span>;
  const hr = Math.floor(min / 60);
  return <span>há {hr}h</span>;
}
