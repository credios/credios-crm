// ═══════════════════════════════════════════════════════════
// Gerador de ID da simulação — formato HE-AAAA-NNNN
// HE     = prefixo fixo (Home Equity)
// AAAA   = ano corrente
// NNNN   = aleatório 0000–9999 com padding à esquerda
// ═══════════════════════════════════════════════════════════
//
// Sem persistência por enquanto — unicidade probabilística (1 em 10k/ano).
// Quando virar requisito, evolui pra consultar tabela do CRM antes de
// devolver o ID. O formato continua o mesmo.

export const SIMULATION_ID_REGEX = /^HE-\d{4}-\d{4}$/;

export interface GenerateSimulationIdOptions {
  year?: number;
  random?: () => number;
}

export function generateSimulationId(
  opts: GenerateSimulationIdOptions = {},
): string {
  const year = opts.year ?? new Date().getFullYear();
  const rand = opts.random ?? Math.random;
  const sequence = Math.floor(rand() * 10000)
    .toString()
    .padStart(4, "0");
  return `HE-${year}-${sequence}`;
}

export function isValidSimulationId(id: string): boolean {
  return SIMULATION_ID_REGEX.test(id);
}
