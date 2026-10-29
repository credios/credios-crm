// ═══════════════════════════════════════════════════════════
// IOF fixo da proposta em faixa (faixa.ts). O simulador simplificado que
// morava aqui (SAC × Price, portado do site) saiu em 2026-10-28 sem uso;
// volta pelo git se precisar.
// ═══════════════════════════════════════════════════════════

// IOF fixo no teto anual (Decreto 12.499/2025): adicional + 0,0082% a.d.
// × 365 dias. PF 0,38% + 2,993% ≈ 3,38% (convenção compartilhada com o
// site); PJ 0,95% + 2,993% ≈ 3,95%.
export const IOF_RATE = 0.0338;
export const IOF_RATE_PJ = 0.0395;

export function iofRatePorTipoPessoa(tipoPessoa: string | null | undefined): number {
  return tipoPessoa === "Pessoa Jurídica" ? IOF_RATE_PJ : IOF_RATE;
}
