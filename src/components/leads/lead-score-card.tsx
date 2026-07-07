"use client";

import { Gauge, Loader2, Lock, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Score de crédito (Direct Data → QUOD) vinculado ao lead. Consulta manual é
// PAGA e restrita a admin — sempre com confirmação explícita (anti-misclick),
// mostrando a idade da última consulta. Demais perfis veem o score, mas o
// botão fica travado. Consulta automática acontece ao agendar reunião.

type Props = {
  leadId: string;
  temCpf: boolean;
  isAdmin: boolean;
  consulta: {
    score: number | null;
    faixa: string | null;
    criadoEm: string; // ISO
    autorNome: string | null; // null = automática
  } | null;
};

function idadeConsulta(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias}d`;
}

export function LeadScoreCard({ leadId, temCpf, isAdmin, consulta }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [pending, setPending] = useState(false);

  async function consultar() {
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/score`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      data?: { score: number | null; faixa: string | null };
    };
    setPending(false);
    setConfirmando(false);
    if (!res.ok) {
      toast.error("Consulta falhou", {
        description: json.error ?? "Tente de novo em instantes.",
      });
      return;
    }
    toast.success(
      json.data?.score != null
        ? `Score consultado: ${json.data.score}`
        : "Score consultado.",
    );
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-muted-foreground" aria-hidden />
          Score de crédito
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            QUOD
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {consulta ? (
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-3xl font-semibold tabular-nums">
              {consulta.score ?? "—"}
            </span>
            <div className="min-w-0">
              {consulta.faixa && (
                <p className="text-sm font-medium">{consulta.faixa}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Consultado {idadeConsulta(consulta.criadoEm)} ·{" "}
                {consulta.autorNome ?? "automático (reunião agendada)"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma consulta de score ainda.
          </p>
        )}

        {!temCpf ? (
          <p className="text-xs text-muted-foreground">
            Lead sem CPF — preencha o CPF para poder consultar.
          </p>
        ) : !isAdmin ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled>
              <Lock className="size-3.5" />
              Consultar score
            </Button>
            <span className="text-xs text-muted-foreground">
              Somente admin pode requisitar.
            </span>
          </div>
        ) : confirmando ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs">
              Nova consulta <span className="font-semibold">paga</span> na
              Direct Data
              {consulta && (
                <>
                  {" "}
                  — a última foi{" "}
                  <span className="font-semibold">
                    {idadeConsulta(consulta.criadoEm)}
                  </span>
                </>
              )}
              . Confirmar?
            </p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={() => void consultar()} disabled={pending}>
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Confirmar consulta
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmando(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmando(true)}>
            <RefreshCw className="size-3.5" />
            Consultar score
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
