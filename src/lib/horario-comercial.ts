/**
 * Horário comercial conforme CLAUDE.md §6.8:
 * 08:00–18:00 horário de Brasília, segunda a sexta, exceto feriados nacionais.
 * Feriados: fixos + móveis (Carnaval, Sexta-feira Santa, Corpus Christi),
 * calculados pela Páscoa (Meeus) — sem dependência externa.
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

// ── Feriados nacionais ──
// Páscoa pelo algoritmo de Meeus/Jones/Butcher (gregoriano).
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

function ymdMaisDias(ano: number, mes: number, dia: number, delta: number): string {
  const d = new Date(Date.UTC(ano, mes - 1, dia + delta));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const feriadosCache = new Map<number, Set<string>>();

/** Feriados nacionais do ano (YYYY-MM-DD). */
export function feriadosNacionais(ano: number): Set<string>  {
  const hit = feriadosCache.get(ano);
  if (hit) return hit;
  const p = pascoa(ano);
  const fixos = [
    `${ano}-01-01`, // Confraternização
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Trabalho
    `${ano}-09-07`, // Independência
    `${ano}-10-12`, // N. Sra. Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação
    `${ano}-11-20`, // Consciência Negra (nacional desde 2024)
    `${ano}-12-25`, // Natal
  ];
  const moveis = [
    ymdMaisDias(ano, p.mes, p.dia, -48), // Carnaval (segunda)
    ymdMaisDias(ano, p.mes, p.dia, -47), // Carnaval (terça)
    ymdMaisDias(ano, p.mes, p.dia, -2), // Sexta-feira Santa
    ymdMaisDias(ano, p.mes, p.dia, 60), // Corpus Christi
  ];
  const set = new Set([...fixos, ...moveis]);
  feriadosCache.set(ano, set);
  return set;
}

function ymdBrt(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function ehFeriadoNacional(date: Date = new Date()): boolean {
  const ymd = ymdBrt(date);
  return feriadosNacionais(Number(ymd.slice(0, 4))).has(ymd);
}

export function dentroHorarioComercial(date: Date = new Date()): boolean {
  const { diaSemana, hora } = obterHoraBrt(date);
  if (diaSemana === 0 || diaSemana === 6) return false;
  if (hora < ABRE_HORA || hora >= FECHA_HORA) return false;
  if (ehFeriadoNacional(date)) return false;
  return true;
}

export function foraHorarioComercial(date: Date = new Date()): boolean {
  return !dentroHorarioComercial(date);
}
