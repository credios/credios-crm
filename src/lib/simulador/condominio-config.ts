// Tipos, defaults e saneamento da config da SIMULAÇÃO DE CRÉDITO PARA
// CONDOMÍNIO (portal do parceiro) — módulo PURO, importável em testes e
// client components. O admin edita em /configuracoes/simulacao-condominio;
// o acesso ao banco fica em ./config.ts.

export type PrazoTaxa = {
  /** Prazo em meses. */
  meses: number;
  /** Taxa de juros, % a.m. (ex.: 2.5). */
  taxaAm: number;
};

export type SimulacaoCondominioConfig = {
  /** Prazos exibidos no PDF, cada um com a própria taxa. Ordenados. */
  prazos: PrazoTaxa[];
  /** Validade da simulação, em dias. */
  validadeDias: number;
  /** IOF: alíquota adicional sobre o valor do crédito, em % (0,38%). */
  iofAdicionalPct: number;
  /** IOF: alíquota diária sobre cada amortização, em % a.d. (PJ: 0,0041%). */
  iofDiarioPct: number;
  /** Faixa de valor que o parceiro pode simular, em reais. */
  valorMinimo: number;
  valorMaximo: number;
};

export const PRAZO_MIN_MESES = 1;
export const PRAZO_MAX_MESES = 180;
export const TAXA_MAX_AM = 15;
export const MAX_PRAZOS = 12;

export const SIMULACAO_CONDOMINIO_DEFAULTS: SimulacaoCondominioConfig = {
  prazos: [6, 12, 18, 24, 36, 48, 60].map((meses) => ({ meses, taxaAm: 2.5 })),
  validadeDias: 15,
  iofAdicionalPct: 0.38,
  iofDiarioPct: 0.0041,
  valorMinimo: 20_000,
  valorMaximo: 20_000_000,
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/** Saneia um JSONB arbitrário pro shape válido (defaults onde inválido). */
export function saneSimulacaoCondominioConfig(raw: unknown): SimulacaoCondominioConfig {
  const c = (raw ?? {}) as Partial<Record<keyof SimulacaoCondominioConfig, unknown>>;
  const d = SIMULACAO_CONDOMINIO_DEFAULTS;

  const vistos = new Set<number>();
  const prazos: PrazoTaxa[] = [];
  for (const p of Array.isArray(c.prazos) ? c.prazos : []) {
    const meses = num((p as PrazoTaxa)?.meses);
    const taxaAm = num((p as PrazoTaxa)?.taxaAm);
    if (!Number.isInteger(meses) || meses < PRAZO_MIN_MESES || meses > PRAZO_MAX_MESES) continue;
    if (!(taxaAm > 0) || taxaAm > TAXA_MAX_AM) continue;
    if (vistos.has(meses)) continue;
    vistos.add(meses);
    prazos.push({ meses, taxaAm: Math.round(taxaAm * 10_000) / 10_000 });
  }
  prazos.sort((a, b) => a.meses - b.meses);

  const validade = num(c.validadeDias);
  const iofAd = num(c.iofAdicionalPct);
  const iofDia = num(c.iofDiarioPct);
  const min = num(c.valorMinimo);
  const max = num(c.valorMaximo);
  const minOk = Number.isFinite(min) && min >= 1_000 ? min : d.valorMinimo;
  const maxOk = Number.isFinite(max) && max > minOk ? max : Math.max(d.valorMaximo, minOk * 10);

  return {
    prazos: prazos.length > 0 ? prazos.slice(0, MAX_PRAZOS) : d.prazos,
    validadeDias:
      Number.isInteger(validade) && validade >= 1 && validade <= 180 ? validade : d.validadeDias,
    iofAdicionalPct: Number.isFinite(iofAd) && iofAd >= 0 && iofAd <= 5 ? iofAd : d.iofAdicionalPct,
    iofDiarioPct: Number.isFinite(iofDia) && iofDia >= 0 && iofDia <= 0.1 ? iofDia : d.iofDiarioPct,
    valorMinimo: minOk,
    valorMaximo: maxOk,
  };
}
