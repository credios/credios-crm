// ============================================================================
// Google Ads — helpers de formatação (puro, sem dependências de runtime).
// Isolado de client.ts pra ser testável sem carregar o SDK gRPC.
// ============================================================================

/**
 * Formata uma data no formato que a Google Ads API exige para
 * conversion_date_time / adjustment_date_time:
 *   "yyyy-MM-dd HH:mm:ss+|-HH:mm"
 * Sempre em America/Sao_Paulo (-03:00). Errar o fuso joga a conversão pra
 * fora da janela de atribuição — por isso é fixo e centralizado aqui.
 */
export function fmtDateTime(d: Date): string {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace("T", " ");
  return `${s}-03:00`;
}
