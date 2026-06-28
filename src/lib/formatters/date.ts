import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// SEMPRE no fuso do negócio (Brasília). Sem isso, render no servidor (Vercel=UTC)
// mostra a hora 3h adiantada. Intl com timeZone resolve em qualquer runtime
// (servidor ou browser), evitando inclusive hydration mismatch.
const TZ = "America/Sao_Paulo";
const fmtData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fmtMesLongo = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "long",
});

function asDate(value: Date | string): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

/** "12/03/2026" (fuso de Brasília) */
export function formatDateBr(value: Date | string): string {
  return fmtData.format(asDate(value));
}

/** "12/03/2026 14:35" (fuso de Brasília) */
export function formatDateTimeBr(value: Date | string): string {
  const d = asDate(value);
  return `${fmtData.format(d)} ${fmtHora.format(d)}`;
}

/** "há 2 horas", "há 3 dias", etc. */
export function formatRelative(value: Date | string): string {
  return formatDistanceToNow(asDate(value), { locale: ptBR, addSuffix: true });
}

/** "12 de março, 14:35" (fuso de Brasília) */
export function formatLong(value: Date | string): string {
  const d = asDate(value);
  return `${fmtMesLongo.format(d)}, ${fmtHora.format(d)}`;
}

/**
 * Lead "esfriando": > 5 dias sem contato. Aplica borda vermelha + ícone de
 * alerta pra forçar consultor a tomar ação ou mover pra status terminal.
 *
 * Antes era 3 dias com badge azul (snowflake) + 5 dias com borda vermelha.
 * Unificado em 5d em 2026-05 — uma única ação, um único nível de alerta.
 *
 * `isCriticallyCold` mantido como alias deprecado pra não quebrar imports.
 */
export function isEsfriando(ultimoContato: Date | string | null | undefined): boolean {
  if (!ultimoContato) return false;
  const d = asDate(ultimoContato).getTime();
  const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
  return d < fiveDaysAgo;
}

/** @deprecated alias de `isEsfriando` — mantido pra não quebrar imports. */
export const isCriticallyCold = isEsfriando;
