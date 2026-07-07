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
  /** Solicitação PENDENTE de consulta (consultor pediu, admin decide). */
  solicitacao: { id: string; solicitanteNome: string; criadoEm: string } | null;
};

// Faixas oficiais do QUOD Score (fonte: Direct Data + blog da QUOD). A escala
// do QUOD vai de 300 a 1000 (não começa em zero, diferente de outros bureaus).
const QUOD_MIN = 300;
const QUOD_MAX = 1000;
const FAIXAS_QUOD = [
  { min: 300, max: 600, rotulo: "Alto índice de inadimplência", cor: "bg-rose-500" },
  { min: 601, max: 700, rotulo: "Médio índice de inadimplência", cor: "bg-amber-500" },
  { min: 701, max: 1000, rotulo: "Baixo índice de inadimplência", cor: "bg-emerald-500" },
] as const;

function GuiaQuod({ score }: { score: number }) {
  return (
    <div className="space-y-1.5">
      {/* Barra 300–1000 (escala real do QUOD) com marcador no score */}
      <div className="relative pt-2">
        <div
          className="absolute top-0 size-2 -translate-x-1/2 rotate-45 rounded-[2px] bg-foreground"
          style={{
            left: `${Math.min(100, Math.max(0, ((score - QUOD_MIN) / (QUOD_MAX - QUOD_MIN)) * 100))}%`,
          }}
          aria-hidden
        />
        <div className="flex h-1.5 w-full overflow-hidden rounded-full">
          {FAIXAS_QUOD.map((f) => (
            <div
              key={f.min}
              className={f.cor}
              style={{ width: `${((f.max - Math.max(f.min, QUOD_MIN)) / (QUOD_MAX - QUOD_MIN)) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <ul className="space-y-0.5">
        {FAIXAS_QUOD.map((f) => {
          const atual = score >= f.min && score <= f.max;
          return (
            <li
              key={f.min}
              className={`flex items-center gap-1.5 text-[11px] ${
                atual ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className={`size-1.5 rounded-full ${f.cor}`} aria-hidden />
              <span className="font-mono tabular-nums">
                {f.min}–{f.max}
              </span>
              {f.rotulo}
              {atual && <span className="text-fg-subtle">← este lead</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function idadeConsulta(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias}d`;
}

export function LeadScoreCard({ leadId, temCpf, isAdmin, consulta, solicitacao }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingSol, setPendingSol] = useState<string | null>(null);

  async function solicitar() {
    setPendingSol("solicitar");
    const res = await fetch(`/api/leads/${leadId}/score/solicitar`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setPendingSol(null);
    if (!res.ok) {
      toast.error("Não deu pra solicitar", { description: json.error ?? "Tente de novo." });
      return;
    }
    toast.success("Solicitação enviada — o admin foi avisado por e-mail.");
    startTransition(() => router.refresh());
  }

  async function resolver(acao: "aprovar" | "recusar") {
    if (!solicitacao) return;
    setPendingSol(acao);
    const res = await fetch(`/api/score/solicitacoes/${solicitacao.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setPendingSol(null);
    if (!res.ok) {
      toast.error("Não deu certo", { description: json.error ?? "Tente de novo." });
      return;
    }
    toast.success(acao === "aprovar" ? "Aprovado — score consultado." : "Solicitação recusada.");
    startTransition(() => router.refresh());
  }

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

        {consulta?.score != null && <GuiaQuod score={consulta.score} />}

        {solicitacao && isAdmin && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs">
              <span className="font-semibold">{solicitacao.solicitanteNome}</span>{" "}
              solicitou a consulta de score {idadeConsulta(solicitacao.criadoEm)}.
              Consulta paga na Direct Data — aprovar?
            </p>
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={() => void resolver("aprovar")} disabled={!!pendingSol}
                className="bg-emerald-600 hover:bg-emerald-600/90 text-white">
                {pendingSol === "aprovar" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Aprovar e consultar
              </Button>
              <Button size="sm" variant="outline" onClick={() => void resolver("recusar")} disabled={!!pendingSol}>
                Recusar
              </Button>
            </div>
          </div>
        )}

        {!temCpf ? (
          <p className="text-xs text-muted-foreground">
            Lead sem CPF — preencha o CPF para poder consultar.
          </p>
        ) : !isAdmin ? (
          solicitacao ? (
            <p className="text-xs text-muted-foreground">
              <Lock className="size-3 inline mr-1" />
              Solicitação enviada {idadeConsulta(solicitacao.criadoEm)} — aguardando
              aprovação do admin.
            </p>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" disabled={!!pendingSol}
                onClick={() => void solicitar()}>
                {pendingSol === "solicitar" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Solicitar consulta ao admin
              </Button>
              <span className="text-xs text-muted-foreground">
                A consulta é paga — o admin aprova e o score aparece aqui.
              </span>
            </div>
          )
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
