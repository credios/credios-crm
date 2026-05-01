/**
 * Horário comercial conforme CLAUDE.md §6.8:
 * 08:00–18:00 horário de Brasília, segunda a sexta, exceto feriados nacionais.
 *
 * MVP: ainda não considera feriados — TODO Fase 4 (integrar API ou tabela
 * de feriados nacionais).
 */
const TIMEZONE = "America/Sao_Paulo";
const ABRE_HORA = 8;
const FECHA_HORA = 18; // exclusivo: 18:00 já é fora do horário

export type HoraBrt = {
  diaSemana: number; // 0=domingo, 6=sábado
  hora: number; // 0-23
};

export function obterHoraBrt(date: Date = new Date()): HoraBrt {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    diaSemana: map[weekdayShort] ?? 0,
    hora: parseInt(hourStr, 10),
  };
}

export function dentroHorarioComercial(date: Date = new Date()): boolean {
  const { diaSemana, hora } = obterHoraBrt(date);
  if (diaSemana === 0 || diaSemana === 6) return false;
  if (hora < ABRE_HORA || hora >= FECHA_HORA) return false;
  return true;
}

export function foraHorarioComercial(date: Date = new Date()): boolean {
  return !dentroHorarioComercial(date);
}
