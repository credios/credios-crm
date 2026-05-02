"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function PainelExecutivoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/admin/painel-executivo] error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">
          Painel executivo indisponível
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Não consegui montar a visão estratégica agora. Tente recarregar — se
          persistir, avise o time técnico com o código abaixo.
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
