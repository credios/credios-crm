import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function asDate(value: Date | string): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

/** "12/03/2026" */
export function formatDateBr(value: Date | string): string {
  return format(asDate(value), "dd/MM/yyyy", { locale: ptBR });
}

/** "12/03/2026 14:35" */
export function formatDateTimeBr(value: Date | string): string {
  return format(asDate(value), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** "há 2 horas", "há 3 dias", etc. */
export function formatRelative(value: Date | string): string {
  return formatDistanceToNow(asDate(value), { locale: ptBR, addSuffix: true });
}

/** "12 de março, 14:35" */
export function formatLong(value: Date | string): string {
  return format(asDate(value), "dd 'de' MMMM, HH:mm", { locale: ptBR });
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
