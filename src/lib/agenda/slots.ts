import { freeBusy } from "@/lib/calendar/google";
import { isBusinessDayBrt, startOfDayBrt, toYmdInBrt } from "@/lib/datetime/brt";

// Grade da AGENDA PÚBLICA (tela de sucesso do simulador) — parâmetros do owner
// (2026-07-06): blocos de 15 min, inícios de 08:00 a 19:30 (inclusive), sempre
// 2 dias (dia atual — ou próximo útil — e o dia útil seguinte), fuso de
// Brasília. Reunião rápida e assertiva de ~15 min. Antecedência mínima dá
// fôlego pro consultor ver o convite antes de o cliente entrar no Meet.

const DURACAO_MIN = 15;
const PASSO_MIN = 15;
const HORA_INICIO_MIN = 8 * 60; // 08:00
const ULTIMO_INICIO_MIN = 19 * 60 + 30; // 19:30 (inclusive)
const ANTECEDENCIA_MIN = 120; // 2h — ajustável

export type SlotPublico = { inicioISO: string; hora: string };
export type DiaAgenda = {
  ymd: string;
  /** "SEG", "TER"… (BRT) */
  diaSemana: string;
  /** "06/07" */
  data: string;
  slots: SlotPublico[];
};

const fmtDia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

function cabecalhoDia(ymd: string): { diaSemana: string; data: string } {
  const p = fmtDia.formatToParts(startOfDayBrt(ymd));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    diaSemana: g("weekday").replace(".", "").toUpperCase().slice(0, 3),
    data: `${g("day")}/${g("month")}`,
  };
}

function horaLabel(minutosNoDia: number): string {
  const h = Math.floor(minutosNoDia / 60);
  const m = minutosNoDia % 60;
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function proximoDiaUtil(aPartirDe: string): string {
  let d = startOfDayBrt(aPartirDe);
  do {
    d = new Date(d.getTime() + 864e5);
  } while (!isBusinessDayBrt(toYmdInBrt(d)));
  return toYmdInBrt(d);
}

function diaUtilOuProximo(ymd: string): string {
  return isBusinessDayBrt(ymd) ? ymd : proximoDiaUtil(ymd);
}

/** Inícios candidatos do dia (ms UTC), já cortados pela antecedência mínima.
 *  Exportado pra teste (grade 08:00–19:30, passo 15). */
export function candidatosDoDia(ymd: string, minInicioMs: number): number[] {
  const base = startOfDayBrt(ymd).getTime();
  const out: number[] = [];
  for (let m = HORA_INICIO_MIN; m <= ULTIMO_INICIO_MIN; m += PASSO_MIN) {
    const inicio = base + m * 60_000;
    if (inicio >= minInicioMs) out.push(inicio);
  }
  return out;
}

type Busy = { start: string; end: string };
function livre(inicioMs: number, busy: Busy[]): boolean {
  const fimMs = inicioMs + DURACAO_MIN * 60_000;
  return !busy.some((b) => {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    return inicioMs < e && s < fimMs;
  });
}

/**
 * Os 2 dias da agenda pública do consultor, com os horários LIVRES (agenda
 * Google real). Se o dia atual já não tem nenhum horário possível (fim do dia,
 * antecedência), a janela desliza pro próximo dia útil — a página sempre mostra
 * 2 dias com pelo menos o primeiro utilizável.
 */
export async function diasAgendaPublica(consultorEmail: string): Promise<DiaAgenda[]> {
  const minInicioMs = Date.now() + ANTECEDENCIA_MIN * 60_000;

  // Escolhe d1: primeiro dia útil (a partir de hoje BRT) com candidato viável.
  let d1 = diaUtilOuProximo(toYmdInBrt(new Date()));
  for (let i = 0; i < 10 && candidatosDoDia(d1, minInicioMs).length === 0; i++) {
    d1 = proximoDiaUtil(d1);
  }
  const d2 = proximoDiaUtil(d1);

  const busy = await freeBusy(
    consultorEmail,
    startOfDayBrt(d1).toISOString(),
    new Date(startOfDayBrt(d2).getTime() + 21 * 60 * 60_000).toISOString(),
  );

  return [d1, d2].map((ymd) => {
    const slots = candidatosDoDia(ymd, minInicioMs)
      .filter((ms) => livre(ms, busy))
      .map((ms) => {
        const minutosNoDia = Math.round((ms - startOfDayBrt(ymd).getTime()) / 60_000);
        return { inicioISO: new Date(ms).toISOString(), hora: horaLabel(minutosNoDia) };
      });
    return { ymd, ...cabecalhoDia(ymd), slots };
  });
}

/**
 * Valida um horário POSTado pelo site: precisa ser um dos slots atualmente
 * ofertados (grade + agenda livre — membership, sem confiar no cliente).
 * Retorna o fim do bloco pra criação do evento.
 */
export async function validarSlotPublico(
  consultorEmail: string,
  inicioISO: string,
): Promise<{ ok: boolean; fimISO: string }> {
  const inicio = new Date(inicioISO);
  const fimISO = new Date(inicio.getTime() + DURACAO_MIN * 60_000).toISOString();
  if (Number.isNaN(inicio.getTime())) return { ok: false, fimISO };
  const dias = await diasAgendaPublica(consultorEmail);
  const ok = dias.some((d) => d.slots.some((s) => s.inicioISO === inicio.toISOString()));
  return { ok, fimISO };
}
