// ═══════════════════════════════════════════════════════════
// Helpers de cálculo financeiro pro simulador interno do CRM.
// Portado do credios-website-v2 (src/lib/financial.ts) — mantido
// como cópia pra evitar dependência cruzada entre projetos.
// Subset: só PMT e IRR; o restante (comparativos entre prazos)
// não é usado pelo simulador simplificado.
// ═══════════════════════════════════════════════════════════

/**
 * Calcula PMT (parcela mensal) pela Tabela Price.
 * @param principal - Valor financiado
 * @param ratePercent - Taxa de juros mensal em % (ex: 1.09)
 * @param nper - Número de parcelas
 */
export function calculatePricePMT(
  principal: number,
  ratePercent: number,
  nper: number,
): number {
  if (ratePercent === 0) return principal / nper;
  const r = ratePercent / 100;
  return (
    (principal * (r * Math.pow(1 + r, nper))) /
    (Math.pow(1 + r, nper) - 1)
  );
}

/**
 * Calcula IRR (Taxa Interna de Retorno) via Newton-Raphson.
 * Usado pelo CET — TIR do fluxo `[-credito, parcela₁, …, parcelaₙ]`.
 *
 * @param values - Fluxo de caixa (primeiro valor negativo = investimento)
 * @param guess  - Estimativa inicial (default 0.01 = 1% a.m.)
 * @returns Taxa mensal em % (ex: 1.19); fallback p/ guess*100 se não converge.
 */
export function calculateIRR(values: number[], guess: number = 0.01): number {
  const maxIterations = 100;
  const tolerance = 1e-6;
  let rate = guess;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let npv = 0;
    let dnpv = 0;

    for (let i = 0; i < values.length; i++) {
      const factor = Math.pow(1 + rate, i);
      npv += values[i] / factor;
      dnpv -= (i * values[i]) / (factor * (1 + rate));
    }

    if (Math.abs(npv) < tolerance) return rate * 100;
    if (dnpv === 0) break;

    let newRate = rate - npv / dnpv;
    if (newRate < -0.99) newRate = -0.99;
    else if (newRate > 10) newRate = 10;

    if (Math.abs(newRate - rate) < tolerance) return newRate * 100;
    rate = newRate;
  }

  return guess * 100;
}
