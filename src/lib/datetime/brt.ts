/**
 * Helpers de fuso horário do negócio (BRT/Brasília, UTC-3 fixo).
 *
 * Brasil aboliu horário de verão em 2019 (Decreto 9.772/2019), então o
 * offset é constante -03:00 por enquanto. Se voltar HV no futuro:
 *   - TODO: trocar por timezone IANA (`America/Sao_Paulo`) via Intl.DateTimeFormat
 *     ou date-fns-tz, que cuidam da regra de transição automaticamente.
 *
 * Por que não usar `new Date('YYYY-MM-DDT00:00:00Z')`:
 *   Filtros tipo "criado entre 1/3 e 31/3" devem cobrir o dia inteiro NO BRT,
 *   não em UTC. UTC 00:00 do dia X = BRT 21:00 do dia X-1, então um lead
 *   criado às 22:00 do dia X-1 BRT cairia DENTRO do filtro do dia X UTC,
 *   distorcendo todos os relatórios.
 */

/** Offset BRT em minutos (negativo: oeste de Greenwich). */
const BRT_OFFSET_MINUTES = -3 * 60;

/** Sufixo a aplicar em strings ISO (ex: "2026-03-01T00:00:00-03:00"). */
const BRT_OFFSET_SUFFIX = "-03:00";

/**
 * Início do dia no BRT (00:00:00 de Brasília) como Date UTC.
 *
 * Aceita string `YYYY-MM-DD` (do form `<input type="date">`) ou Date.
 *
 * Exemplo: startOfDayBrt("2026-03-15")
 *   → Date com timestamp = 2026-03-15T00:00:00-03:00 = 2026-03-15T03:00:00Z
 */
export function startOfDayBrt(d: string | Date): Date {
  const ymd = typeof d === "string" ? d : toYmdInBrt(d);
  return new Date(`${ymd}T00:00:00${BRT_OFFSET_SUFFIX}`);
}

/**
 * Fim do dia no BRT (23:59:59.999 de Brasília) como Date UTC.
 *
 * Exemplo: endOfDayBrt("2026-03-15")
 *   → Date com timestamp = 2026-03-15T23:59:59.999-03:00 = 2026-03-16T02:59:59.999Z
 */
export function endOfDayBrt(d: string | Date): Date {
  const ymd = typeof d === "string" ? d : toYmdInBrt(d);
  return new Date(`${ymd}T23:59:59.999${BRT_OFFSET_SUFFIX}`);
}

export function endOfBusinessDayBrt(d: string | Date): Date {
  const ymd = typeof d === "string" ? d : toYmdInBrt(d);
  return new Date(`${ymd}T18:00:00.000${BRT_OFFSET_SUFFIX}`);
}

/**
 * Converte um Date pra string YYYY-MM-DD respeitando BRT (não UTC).
 * Usado quando o source é Date e o destino quer o mesmo "dia visto pelo
 * usuário no Brasil".
 */
export function toYmdInBrt(d: Date): string {
  // shift do timestamp pelo offset BRT, depois extrai YYYY-MM-DD em UTC
  // (que agora reflete a hora local BRT).
  const ms = d.getTime() + BRT_OFFSET_MINUTES * 60_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayYmdBrt(now: Date = new Date()): string {
  return toYmdInBrt(now);
}

export function weekdayInBrt(d: string | Date): number {
  const date = typeof d === "string" ? startOfDayBrt(d) : d;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  });
  const weekdayShort = fmt.formatToParts(date).find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekdayShort] ?? 1;
}

export function isBusinessDayBrt(d: string | Date = new Date()): boolean {
  const wd = weekdayInBrt(d);
  return wd >= 1 && wd <= 5;
}

export function previousBusinessDayYmdBrt(now: Date = new Date()): string {
  let d = startOfDayBrt(now);
  do {
    d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  } while (!isBusinessDayBrt(d));
  return toYmdInBrt(d);
}
