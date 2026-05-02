"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function RelatoriosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/relatorios] error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">
          Não foi possível carregar os relatórios
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Algo deu errado ao montar o dashboard. Tente novamente em alguns
          segundos. Se o problema continuar, avise o time técnico.
        </p>
        {error.digest && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg-subtle">
            ref · {error.digest}
          </p>
        )}
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        <RotateCw className="mr-2 size-4" />
        Tentar novamente
      </Button>
    </div>
  );
}
