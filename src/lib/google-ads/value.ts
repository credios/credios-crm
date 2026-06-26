// ============================================================================
// Google Ads — modelo de valor das conversões (puro, testável).
// ============================================================================
// O Smart Bidding otimiza pelo `conversion_value`. Trabalhamos com valor
// ESPERADO de receita por lead (modelo por-lead, decidido com o Gabriel):
//
//   Lead Qualificado → valor_credito × SUCCESS_FEE_PCT × QUALIFIED_CLOSE_RATE
//   Negócio Fechado  → comissão real (comissaoCentavos); fallback estimado
//
// Assim a otimização já favorece tickets maiores desde a qualificação, e o
// fechamento carrega a receita realizada.
//
// ⚠️ FASE 1: estes percentuais são estimativas. Ajustar aqui (arquivo único)
// quando houver histórico real de fechamento por ticket. Valores em centavos
// (convenção do schema); convertidos pra BRL só no upload.
// ============================================================================

/** Success fee (comissão) sobre o valor do crédito. */
export const SUCCESS_FEE_PCT = 0.05;

/** Fração dos leads qualificados que efetivamente fecham (~5%). */
export const QUALIFIED_CLOSE_RATE = 0.05;

/** Ticket médio de crédito — fallback quando o lead não tem valor_credito. */
export const TICKET_MEDIO_CENTAVOS = 500_000_00; // R$ 500.000,00

/**
 * Valor esperado (centavos) de uma conversão "Lead Qualificado".
 * = crédito × comissão × taxa de fechamento esperada.
 */
export function qualifiedValueCents(
  valorCreditoCentavos: number | null | undefined,
): number {
  const base =
    valorCreditoCentavos && valorCreditoCentavos > 0
      ? valorCreditoCentavos
      : TICKET_MEDIO_CENTAVOS;
  return Math.round(base * SUCCESS_FEE_PCT * QUALIFIED_CLOSE_RATE);
}

/**
 * Valor (centavos) de uma conversão "Negócio Fechado".
 * Usa a comissão real quando disponível; senão estima a partir do valor
 * liberado (ou do crédito) × success fee.
 */
export function closedValueCents(lead: {
  comissaoCentavos?: number | null;
  valorLiberadoCentavos?: number | null;
  valorCreditoCentavos?: number | null;
}): number {
  if (lead.comissaoCentavos && lead.comissaoCentavos > 0) {
    return lead.comissaoCentavos;
  }
  const base =
    lead.valorLiberadoCentavos ??
    lead.valorCreditoCentavos ??
    TICKET_MEDIO_CENTAVOS;
  return Math.round(base * SUCCESS_FEE_PCT);
}
