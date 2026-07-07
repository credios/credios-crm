"use client";

import { CalendarCheck, Check, Loader2, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// UI pública de agendamento — enxuta, mobile-first (o cliente abre do
// WhatsApp). Mesma API da agenda do simulador; qualquer erro → mensagem
// gentil com fallback pro consultor.

type Slot = { inicioISO: string; hora: string };
type Dia = { ymd: string; diaSemana: string; data: string; slots: Slot[] };
type Grade = {
  jaAgendada: boolean;
  quando?: string;
  consultor?: string;
  primeiroNome?: string;
  dias?: Dia[];
};

type Fase =
  | { t: "carregando" }
  | { t: "erro" }
  | { t: "pronta"; grade: Grade; aviso?: string }
  | { t: "enviando"; grade: Grade }
  | { t: "confirmada"; quando: string; consultor?: string };

export function AgendarClient({ token }: { token: string }) {
  const [fase, setFase] = useState<Fase>({ t: "carregando" });
  const [diaAtivo, setDiaAtivo] = useState(0);
  const [slotSel, setSlotSel] = useState<Slot | null>(null);

  const carregar = useCallback(async (): Promise<Grade | null> => {
    try {
      const res = await fetch(`/api/public/agenda/${token}`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as Grade;
    } catch {
      return null;
    }
  }, [token]);

  useEffect(() => {
    let vivo = true;
    void carregar().then((grade) => {
      if (!vivo) return;
      if (!grade) return setFase({ t: "erro" });
      if (grade.jaAgendada && grade.quando)
        return setFase({ t: "confirmada", quando: grade.quando, consultor: grade.consultor });
      if (!grade.dias?.some((d) => d.slots.length > 0)) return setFase({ t: "erro" });
      setFase({ t: "pronta", grade });
    });
    return () => {
      vivo = false;
    };
  }, [carregar]);

  const confirmar = async () => {
    if (fase.t !== "pronta" || !slotSel) return;
    const grade = fase.grade;
    setFase({ t: "enviando", grade });
    try {
      const res = await fetch(`/api/public/agenda/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inicio: slotSel.inicioISO }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        quando?: string;
        consultor?: string;
      };
      if (res.ok && json.ok && json.quando) {
        setFase({ t: "confirmada", quando: json.quando, consultor: json.consultor ?? grade.consultor });
        return;
      }
      const nova = await carregar();
      setSlotSel(null);
      if (nova?.dias?.some((d) => d.slots.length > 0)) {
        setFase({
          t: "pronta",
          grade: nova,
          aviso: "Esse horário acabou de ser reservado — escolha outro, por favor.",
        });
      } else {
        setFase({ t: "erro" });
      }
    } catch {
      setFase({ t: "pronta", grade, aviso: "Não conseguimos confirmar agora. Tente de novo." });
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <p className="mb-6 text-center font-display text-xl font-bold tracking-tight">
          Credios
        </p>

        {fase.t === "carregando" && (
          <div className="rounded-2xl border bg-background p-8 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Carregando horários…</p>
          </div>
        )}

        {fase.t === "erro" && (
          <div className="rounded-2xl border bg-background p-8 text-center space-y-2">
            <p className="font-display text-lg font-semibold">Link indisponível</p>
            <p className="text-sm text-muted-foreground">
              Este link expirou ou não há horários no momento. Responda a mensagem no
              WhatsApp que o seu consultor marca com você. 🙂
            </p>
          </div>
        )}

        {fase.t === "confirmada" && (
          <div className="rounded-2xl border bg-background p-8 text-center space-y-3">
            <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
              <CalendarCheck className="size-6 text-emerald-600" />
            </span>
            <p className="font-display text-lg font-semibold">Horário garantido!</p>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{fase.quando}</span>{" "}
              (horário de Brasília), por vídeo
              {fase.consultor ? ` com o consultor ${fase.consultor.split(/\s+/)[0]}` : ""}. O
              convite com o link chegou no seu e-mail. São 10–15 minutos, direto ao ponto —
              até lá!
            </p>
          </div>
        )}

        {(fase.t === "pronta" || fase.t === "enviando") && (
          <GradeUI
            fase={fase}
            diaAtivo={diaAtivo}
            setDiaAtivo={(i) => {
              setDiaAtivo(i);
              setSlotSel(null);
            }}
            slotSel={slotSel}
            setSlotSel={setSlotSel}
            confirmar={confirmar}
          />
        )}
      </div>
    </main>
  );
}

function GradeUI({
  fase,
  diaAtivo,
  setDiaAtivo,
  slotSel,
  setSlotSel,
  confirmar,
}: {
  fase: { t: "pronta"; grade: Grade; aviso?: string } | { t: "enviando"; grade: Grade };
  diaAtivo: number;
  setDiaAtivo: (i: number) => void;
  slotSel: Slot | null;
  setSlotSel: (s: Slot | null) => void;
  confirmar: () => Promise<void>;
}) {
  const grade = fase.grade;
  const dias = grade.dias ?? [];
  const dia = dias[Math.min(diaAtivo, dias.length - 1)]!;
  const enviando = fase.t === "enviando";
  const aviso = fase.t === "pronta" ? fase.aviso : undefined;

  return (
    <div className="rounded-2xl border bg-background p-6">
      <p className="text-center font-display text-lg font-semibold">
        {grade.primeiroNome ? `${grade.primeiroNome}, escolha` : "Escolha"} o melhor horário
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-center text-sm text-muted-foreground">
        <Video className="mr-1 inline size-4 align-[-2px] text-emerald-600" />
        Conversa por vídeo de <strong className="text-foreground">15 minutos</strong>, direta
        ao ponto{grade.consultor ? ` com ${grade.consultor}` : ""}. Horários de Brasília.
      </p>

      <div className="mt-5 grid grid-cols-2" role="tablist">
        {dias.map((d, i) => {
          const ativo = i === diaAtivo;
          return (
            <button
              key={d.ymd}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setDiaAtivo(i)}
              className={`border-b-2 pb-2.5 pt-1 text-center transition-colors ${
                ativo ? "border-primary" : "border-border hover:border-foreground/30"
              }`}
            >
              <span
                className={`block font-mono text-[11px] uppercase tracking-widest ${
                  ativo ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {d.diaSemana}
              </span>
              <span
                className={`block text-base font-semibold ${
                  ativo ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {d.data}
              </span>
            </button>
          );
        })}
      </div>

      {dia.slots.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sem horários neste dia — veja o outro dia.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {dia.slots.map((s) => {
            const sel = slotSel?.inicioISO === s.inicioISO;
            return (
              <button
                key={s.inicioISO}
                type="button"
                aria-pressed={sel}
                disabled={enviando}
                onClick={() => setSlotSel(sel ? null : s)}
                className={`h-10 rounded-lg border text-sm font-medium tabular-nums transition-colors disabled:opacity-50 ${
                  sel
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:border-foreground/40"
                }`}
              >
                {s.hora}
              </button>
            );
          })}
        </div>
      )}

      {aviso && (
        <p className="mt-4 text-center text-[13px] font-medium text-amber-700">{aviso}</p>
      )}

      {slotSel && (
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={enviando}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Confirmando…
            </>
          ) : (
            <>
              <Check className="size-4" /> Confirmar {dia.diaSemana.toLowerCase()} {dia.data} às{" "}
              {slotSel.hora}
            </>
          )}
        </button>
      )}
    </div>
  );
}
