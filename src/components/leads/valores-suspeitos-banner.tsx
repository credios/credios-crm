"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CAMPO_LABEL,
  type ValoresSuspeitos,
} from "@/lib/leads/valores-suspeitos";

type Acao = "aceitar" | "manter";

type Props = {
  leadId: string;
  valoresSuspeitos: ValoresSuspeitos;
};

/** Formata reais sem decimais (ex.: "R$ 6.000.000"). */
const fmtReais = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/**
 * Banner exibido no topo do /leads/[id] quando o webhook detectou valores
 * monetários fora do range esperado. Mostra:
 *   - Lista comparativa: valor informado × valor sugerido (÷1000)
 *   - 2 ações: aplicar correção OU confirmar valores
 *
 * Após qualquer ação, marca como revisado e some via router.refresh().
 * Visível pra admin/gerente apenas (filtragem feita no server).
 */
export function ValoresSuspeitosBanner({ leadId, valoresSuspeitos }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAcao, setPendingAcao] = useState<Acao | null>(null);
  const [confirmingAcao, setConfirmingAcao] = useState<Acao | null>(null);

  const camposLista = (
    ["renda", "imovel", "credito"] as const
  ).filter((k) => valoresSuspeitos.campos[k]);

  function submit(acao: Acao) {
    setPendingAcao(acao);
    setConfirmingAcao(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}/revisar-valores`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ acao }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error ?? "Falha na revisão",
          );
        }
        toast.success(
          acao === "aceitar"
            ? "Valores corrigidos (÷1000)."
            : "Valores confirmados como informados.",
        );
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Erro inesperado na revisão",
        );
      } finally {
        setPendingAcao(null);
      }
    });
  }

  return (
    <>
      <div
        role="alert"
        className="rounded-xl border border-gold-200/80 bg-gold-50/70 px-4 py-3.5 shadow-sm dark:border-gold-900/40 dark:bg-gold-950/30"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-900/50 dark:text-gold-300">
            <AlertTriangle className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-semibold text-gold-900 dark:text-gold-100">
              Valores suspeitos detectados
            </h3>
            <p className="mt-0.5 text-xs text-gold-800/90 dark:text-gold-200/90">
              Possível erro de digitação (casas decimais). Revise antes de
              prosseguir.
            </p>

            <div className="mt-3 overflow-hidden rounded-lg border border-gold-200/70 bg-background/70 dark:border-gold-900/40">
              <table className="w-full text-xs">
                <thead className="bg-gold-100/60 text-[10px] uppercase tracking-wider text-gold-900/80 dark:bg-gold-900/40 dark:text-gold-100/80">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Campo</th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      Informado
                    </th>
                    <th className="w-6 px-1"></th>
                    <th className="px-3 py-1.5 text-right font-medium">
                      Sugestão (÷1000)
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {camposLista.map((campo) => {
                    const valor = valoresSuspeitos.valoresOriginais[campo] ?? 0;
                    const sugerido = Math.round(valor / 1000);
                    return (
                      <tr
                        key={campo}
                        className="border-t border-gold-100/80 dark:border-gold-900/40"
                      >
                        <td className="px-3 py-1.5 font-sans text-foreground">
                          {CAMPO_LABEL[campo]}
                        </td>
                        <td className="px-3 py-1.5 text-right text-foreground/80 line-through decoration-destructive/60 decoration-1">
                          {fmtReais.format(valor)}
                        </td>
                        <td className="px-1 text-center text-gold-700/60 dark:text-gold-300/60">
                          <ArrowRight className="mx-auto size-3" />
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold text-gold-900 dark:text-gold-100">
                          {fmtReais.format(sugerido)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => setConfirmingAcao("aceitar")}
                disabled={isPending}
                className="bg-gold-600 text-white hover:bg-gold-700 dark:bg-gold-500 dark:text-gold-50 dark:hover:bg-gold-400"
              >
                {pendingAcao === "aceitar" ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                )}
                Aplicar correção (÷1000)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmingAcao("manter")}
                disabled={isPending}
                className="border-gold-300 text-gold-900 hover:bg-gold-100 dark:border-gold-800 dark:text-gold-100 dark:hover:bg-gold-900/50"
              >
                {pendingAcao === "manter" ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : null}
                Valores estão corretos
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmação extra pra evitar clique acidental. Ambas ações são
          reversíveis (admin pode editar campos manualmente depois), mas
          o registro na timeline + audit log fica — então pede confirmação. */}
      <Dialog
        open={confirmingAcao !== null}
        onOpenChange={(open) => !open && setConfirmingAcao(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmingAcao === "aceitar"
                ? "Aplicar correção (÷1000)?"
                : "Confirmar valores como informados?"}
            </DialogTitle>
            <DialogDescription className="pt-1">
              {confirmingAcao === "aceitar" ? (
                <>
                  Os valores dos campos suspeitos serão divididos por 1000 e o
                  lead deixará de aparecer com a flag amarela. Ação registrada
                  na timeline e no audit log.
                </>
              ) : (
                <>
                  Os valores informados pelo cliente serão mantidos como estão
                  (lead high-net-worth ou similar). A flag será removida e a
                  decisão fica registrada na timeline.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmingAcao(null)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => confirmingAcao && submit(confirmingAcao)}
              disabled={isPending}
              className={
                confirmingAcao === "aceitar"
                  ? "bg-gold-600 text-white hover:bg-gold-700"
                  : ""
              }
            >
              {isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
