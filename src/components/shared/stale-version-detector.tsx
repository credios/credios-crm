"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// Stale Version Detector
// ============================================================================
// Faz fetch periódico em /api/version. Quando vê que o SHA mudou desde que
// o cliente carregou (deploy novo), mostra banner persistente "nova versão —
// recarregue".
//
// Padrão usado por Linear, Notion, Vercel: evita o cenário comum onde o
// consultor tem a aba aberta há horas, há deploy com fix de bug, e ele
// continua usando código antigo achando que tá tudo igual.
//
// Polling strategy:
//   - 1x ao montar (estabelece baseline)
//   - A cada vez que a aba volta a ficar visível (visibilitychange) —
//     captura o caso comum "consultor voltou pra aba depois de almoço"
//   - A cada 5min em background — captura uso contínuo
//
// Endpoint é leve (~50 bytes) e tem cache-control: no-store. Custo desprezível.
// ============================================================================

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min

export function StaleVersionDetector() {
  const baselineRef = useRef<string | null>(null);
  const [staleVersion, setStaleVersion] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!version || !mounted) return;

        if (baselineRef.current === null) {
          // Primeira leitura — define baseline e nunca mais zera.
          baselineRef.current = version;
        } else if (version !== baselineRef.current && version !== staleVersion) {
          // Versão no servidor mudou desde que o cliente carregou.
          setStaleVersion(version);
        }
      } catch {
        // Rede caiu, etc — silencioso. Não polui o console em offline.
      }
    }

    void check();
    interval = setInterval(check, POLL_INTERVAL_MS);

    function onVisibility() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // staleVersion no deps: ao detectar uma versão nova e mostrar o banner,
    // se houver OUTRA versão depois (deploy seguido de deploy), o useEffect
    // re-roda e detecta de novo.
  }, [staleVersion]);

  if (!staleVersion) return null;

  return (
    <div
      role="alert"
      className={cn(
        "fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-md",
        "md:bottom-4",
        "animate-fade-up",
      )}
    >
      <div className="surface-frosted flex items-center gap-3 rounded-xl px-4 py-3 shadow-elev-md ring-1 ring-foreground/15">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-gold-700 dark:text-gold-400">
          <RefreshCw className="size-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">Nova versão disponível</p>
          <p className="text-xs text-muted-foreground">
            Recarregue pra atualizar o CRM e evitar inconsistências (ex: mensagens
            com variáveis não resolvidas).
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => window.location.reload()}
          className="shrink-0"
        >
          Recarregar
        </Button>
      </div>
    </div>
  );
}
