// ═══════════════════════════════════════════════════════════
// Proposta em FAIXA (Avanti-style) — motor de cálculo puro.
//
// Em vez de uma taxa única, a proposta apresenta um RANGE de taxas
// (min–max, definido pelo admin em /configuracoes/simulacao) e mostra,
// pra cada prazo, a faixa de parcela resultante (PRICE = parcela fixa;
// SAC = 1ª parcela). O CET (min–max) é a TIR do fluxo do cliente no
// prazo destaque: recebe o líquido, paga parcelas sobre líquido + IOF.
//
// Números validados contra proposta de referência do mercado:
// R$ 450.000 · pós 1,00–1,59% a.m. → total tomado 465.210, PRICE 240m
// 5.122,36–7.568,54, SAC 240m 1ª 6.590,48–9.335,21, CET 1,05–1,64% a.m.,
// renda mínima (30%) R$ 17.074,54.
// ═══════════════════════════════════════════════════════════

import type { SimulacaoFaixaConfig } from "./faixa-config";
import { calculateIRR, calculatePricePMT } from "./financial";
import { IOF_RATE } from "./simple-simulator";

export type Range = { min: number; max: number };

export type FaixaPrazoRow = {
  prazo: number;
  /** PRICE: parcela mensal (fixa) min–max. */
  price: Range;
  /** SAC: 1ª parcela min–max. */
  sacPrimeira: Range;
  destaque: boolean;
};

export type PropostaFaixaInput = {
  clientName: string;
  clientCPF: string;
  /** Reais. */
  creditAmount: number;
  /** Reais. */
  propertyValue: number;
  indexation: "pre" | "pos";
  tipoPessoa?: string | null;
};

export type PropostaFaixaResult = {
  simulationId: string;
  generatedAt: string; // ISO date
  validUntil: string; // ISO date

  clientName: string;
  clientCPF: string;
  tipoPessoa: string;
  indexation: "pre" | "pos";
  modalidadeLabel: string;

  creditAmount: number;
  propertyValue: number;
  ltv: number;
  iof: number;
  totalTomado: number;

  taxaAm: Range; // % a.m.
  taxaAa: Range; // % a.a. equivalente
  cetAm: Range; // % a.m. (TIR, prazo destaque PRICE)
  cetAa: Range; // % a.a.

  prazoMaximo: number;
  prazoDestaque: number;
  comprometimentoRendaPct: number;
  /** Parcela mínima do prazo destaque (PRICE) / comprometimento. */
  rendaMinimaSugerida: number;
  /** Faixa de parcela do prazo destaque (PRICE) — o destaque da página. */
  parcelaDestaque: Range;

  linhas: FaixaPrazoRow[];
};

function sacPrimeiraParcela(principal: number, taxaAmPct: number, prazo: number): number {
  return principal / prazo + principal * (taxaAmPct / 100);
}

function anualiza(taxaAmPct: number): number {
  return (Math.pow(1 + taxaAmPct / 100, 12) - 1) * 100;
}

/** CET (% a.m.) — TIR do fluxo: cliente recebe o líquido, paga PMT sobre
 *  líquido+IOF no prazo dado. */
function cetAm(
  creditAmount: number,
  totalTomado: number,
  taxaAmPct: number,
  prazo: number,
): number {
  const pmt = calculatePricePMT(totalTomado, taxaAmPct, prazo);
  const fluxo = [-creditAmount, ...Array.from({ length: prazo }, () => pmt)];
  try {
    const irr = calculateIRR(fluxo, taxaAmPct / 100);
    if (irr > 0 && irr < 50) return irr;
  } catch {
    /* fallback abaixo */
  }
  return taxaAmPct;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

export function buildPropostaFaixa(
  input: PropostaFaixaInput,
  config: SimulacaoFaixaConfig,
  opts: { simulationId: string; generatedAt?: Date },
): PropostaFaixaResult {
  const gerada = opts.generatedAt ?? new Date();
  const validade = new Date(gerada);
  validade.setDate(validade.getDate() + config.validadeDias);

  const faixa = input.indexation === "pos" ? config.pos : config.pre;
  const taxaAmRange: Range = { min: faixa.taxaMinAm, max: faixa.taxaMaxAm };

  const iof = input.creditAmount * IOF_RATE;
  const totalTomado = input.creditAmount + iof;
  const ltv =
    input.propertyValue > 0 ? (input.creditAmount / input.propertyValue) * 100 : 0;

  const linhas: FaixaPrazoRow[] = config.prazos.map((prazo) => ({
    prazo,
    price: {
      min: calculatePricePMT(totalTomado, taxaAmRange.min, prazo),
      max: calculatePricePMT(totalTomado, taxaAmRange.max, prazo),
    },
    sacPrimeira: {
      min: sacPrimeiraParcela(totalTomado, taxaAmRange.min, prazo),
      max: sacPrimeiraParcela(totalTomado, taxaAmRange.max, prazo),
    },
    destaque: prazo === config.prazoDestaque,
  }));

  const destaque =
    linhas.find((l) => l.destaque) ?? linhas[linhas.length - 1]!;
  const rendaMinimaSugerida =
    destaque.price.min / (config.comprometimentoRendaPct / 100);

  return {
    simulationId: opts.simulationId,
    generatedAt: toIsoDate(gerada),
    validUntil: toIsoDate(validade),

    clientName: input.clientName,
    clientCPF: input.clientCPF,
    tipoPessoa: input.tipoPessoa || "Pessoa Física",
    indexation: input.indexation,
    modalidadeLabel:
      input.indexation === "pos" ? "Pós-fixada (IPCA + taxa)" : "Pré-fixada",

    creditAmount: input.creditAmount,
    propertyValue: input.propertyValue,
    ltv,
    iof,
    totalTomado,

    taxaAm: taxaAmRange,
    taxaAa: { min: anualiza(taxaAmRange.min), max: anualiza(taxaAmRange.max) },
    cetAm: {
      min: cetAm(input.creditAmount, totalTomado, taxaAmRange.min, destaque.prazo),
      max: cetAm(input.creditAmount, totalTomado, taxaAmRange.max, destaque.prazo),
    },
    cetAa: { min: 0, max: 0 }, // preenchido abaixo (depende do cetAm)

    prazoMaximo: config.prazos[config.prazos.length - 1]!,
    prazoDestaque: destaque.prazo,
    comprometimentoRendaPct: config.comprometimentoRendaPct,
    rendaMinimaSugerida,
    parcelaDestaque: destaque.price,

    linhas,
  };
}

/** Wrapper que fecha o cetAa a partir do cetAm (mantém buildPropostaFaixa puro). */
export function buildProposta(
  input: PropostaFaixaInput,
  config: SimulacaoFaixaConfig,
  opts: { simulationId: string; generatedAt?: Date },
): PropostaFaixaResult {
  const r = buildPropostaFaixa(input, config, opts);
  r.cetAa = { min: anualiza(r.cetAm.min), max: anualiza(r.cetAm.max) };
  return r;
}
