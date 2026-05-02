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

/** Lead "esfriando": ultimo_contato null OU > 3 dias atrás (CLAUDE.md §6.8). */
export function isEsfriando(ultimoContato: Date | string | null | undefined): boolean {
  if (!ultimoContato) return false;
  const d = asDate(ultimoContato).getTime();
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  return d < threeDaysAgo;
}
