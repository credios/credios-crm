// Tipos, defaults e saneamento da config da proposta em faixa — módulo PURO
// (sem server-only) pra ser importável em testes e client components.

export type FaixaTaxa = {
  /** Taxa mínima, % a.m. (ex.: 1.0) */
  taxaMinAm: number;
  /** Taxa máxima, % a.m. (ex.: 1.59) */
  taxaMaxAm: number;
};

export type SimulacaoFaixaConfig = {
  /** Pós-fixado: taxa + IPCA. */
  pos: FaixaTaxa;
  /** Pré-fixado. */
  pre: FaixaTaxa;
  /** Prazos (meses) exibidos nas tabelas PRICE/SAC. */
  prazos: number[];
  /** Prazo destacado como cenário sugerido (também usado no CET e na renda). */
  prazoDestaque: number;
  /** Comprometimento de renda base, em % (ex.: 30). */
  comprometimentoRendaPct: number;
  /** Validade da proposta, em dias. */
  validadeDias: number;
};

export const SIMULACAO_FAIXA_DEFAULTS: SimulacaoFaixaConfig = {
  pos: { taxaMinAm: 1.0, taxaMaxAm: 1.59 },
  pre: { taxaMinAm: 1.39, taxaMaxAm: 1.99 },
  prazos: [60, 120, 180, 240],
  prazoDestaque: 240,
  comprometimentoRendaPct: 30,
  validadeDias: 30,
};

/** Saneia um JSONB arbitrário pro shape válido (defaults onde inválido). */
export function saneSimulacaoConfig(raw: unknown): SimulacaoFaixaConfig {
  const c = (raw ?? {}) as Partial<SimulacaoFaixaConfig>;
  const d = SIMULACAO_FAIXA_DEFAULTS;
  const faixa = (f: Partial<FaixaTaxa> | undefined, def: FaixaTaxa): FaixaTaxa => {
    const min = Number(f?.taxaMinAm);
    const max = Number(f?.taxaMaxAm);
    if (!(min > 0) || !(max >= min)) return def;
    return { taxaMinAm: min, taxaMaxAm: max };
  };
  const prazos = Array.isArray(c.prazos)
    ? c.prazos.map(Number).filter((n) => Number.isInteger(n) && n >= 12 && n <= 420)
    : [];
  const prazosOk = prazos.length > 0 ? [...new Set(prazos)].sort((a, b) => a - b) : d.prazos;
  const destaque =
    Number.isInteger(c.prazoDestaque) && prazosOk.includes(c.prazoDestaque as number)
      ? (c.prazoDestaque as number)
      : prazosOk[prazosOk.length - 1]!;
  const comprometimento =
    Number(c.comprometimentoRendaPct) >= 10 && Number(c.comprometimentoRendaPct) <= 100
      ? Number(c.comprometimentoRendaPct)
      : d.comprometimentoRendaPct;
  const validade =
    Number.isInteger(c.validadeDias) && (c.validadeDias as number) >= 1
      ? (c.validadeDias as number)
      : d.validadeDias;
  return {
    pos: faixa(c.pos, d.pos),
    pre: faixa(c.pre, d.pre),
    prazos: prazosOk,
    prazoDestaque: destaque,
    comprometimentoRendaPct: comprometimento,
    validadeDias: validade,
  };
}
