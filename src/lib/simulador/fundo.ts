// ═══════════════════════════════════════════════════════════
// Simulação do FUNDO (Musashi Capital FIDC) — motor de cálculo puro.
//
// Gerada pela equipe no detalhe do lead (CGI ou condomínio): quem gera
// informa o valor e um ou mais prazos, cada um com a própria taxa. Nada vem
// de config — o fundo ainda está em estruturação e a taxa é caso a caso.
//
// Por prazo: Tabela Price sobre crédito + IOF financiado (mesma conta da
// simulação de condomínio do portal — `iofPrice`).
//   CET = TIR do fluxo do cliente: recebe o crédito, paga as parcelas.
//
// IPCA +: mesma conta sobre a taxa real, sem projetar inflação (convenção da
// proposta em faixa do CGI) — parcelas em valores de hoje; o PDF avisa que
// parcelas e saldo são corrigidos pelo IPCA.
// ═══════════════════════════════════════════════════════════

import { anualiza, iofPrice } from "./condominio";
import { calculateIRR, calculatePricePMT } from "./financial";

export const VALIDADE_SIMULACAO_FUNDO_DIAS = 30;
export const MAX_PRAZOS_SIMULACAO_FUNDO = 10;
/** Prazo máximo com que o fundo trabalha. */
export const PRAZO_MAX_SIMULACAO_FUNDO = 90;

export type IndexacaoFundo = "pre" | "ipca";

export const INDEXACAO_FUNDO_LABEL: Record<IndexacaoFundo, string> = {
  pre: "Pré-fixada",
  ipca: "IPCA + juros",
};

/**
 * IOF-crédito (Decreto 6.306/2007, alíquotas do Decreto 12.499/2025):
 * adicional sobre o valor + diária sobre cada amortização, até 365 dias.
 */
export const IOF_FUNDO = {
  PF: { iofAdicionalPct: 0.38, iofDiarioPct: 0.0082 },
  PJ: { iofAdicionalPct: 0.95, iofDiarioPct: 0.0082 },
  nenhum: { iofAdicionalPct: 0, iofDiarioPct: 0 },
} as const;

export type IofFundo = keyof typeof IOF_FUNDO;

export const IOF_FUNDO_LABEL: Record<IofFundo, string> = {
  PF: "Pessoa física (0,38% + 0,0082% a.d.)",
  PJ: "Pessoa jurídica (0,95% + 0,0082% a.d.)",
  nenhum: "Sem IOF",
};

export type ProdutoSimulacaoFundo = "CGI" | "CONDOMINIO";

export type SimulacaoFundoInput = {
  /** Reais. */
  valorCredito: number;
  /** Na ordem em que foram informados; a saída ordena por prazo. */
  prazos: { meses: number; taxaAm: number }[];
  indexacao: IndexacaoFundo;
  iof: IofFundo;
  produto: ProdutoSimulacaoFundo;
  cliente: {
    nome: string;
    /** CNPJ do condomínio (só dígitos/letras), quando houver. */
    cnpj?: string | null;
  };
  /** Quem preparou — vai no PDF como contato. */
  contato: {
    nome: string;
    email?: string | null;
    whatsapp?: string | null;
  };
};

export type LinhaSimulacaoFundo = {
  meses: number;
  taxaAm: number;
  taxaAa: number;
  iof: number;
  totalFinanciado: number;
  parcela: number;
  totalPago: number;
  cetAm: number;
  cetAa: number;
};

export type SimulacaoFundoResult = SimulacaoFundoInput & {
  codigo: string;
  geradaEm: string; // YYYY-MM-DD (BRT)
  validaAte: string; // YYYY-MM-DD
  linhas: LinhaSimulacaoFundo[];
  menorParcela: LinhaSimulacaoFundo;
};

export const CODIGO_SIMULACAO_FUNDO_REGEX = /^MC-\d{4}-\d{6}$/;

export function gerarCodigoSimulacaoFundo(
  ano: number,
  rand: () => number = Math.random,
): string {
  const seq = Math.floor(rand() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `MC-${ano}-${seq}`;
}

/** Soma dias a uma data YYYY-MM-DD, sem fuso no meio. */
export function somaDiasYmd(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

function cetAm(credito: number, parcela: number, meses: number, taxaAmPct: number): number {
  const fluxo = [-credito, ...Array.from({ length: meses }, () => parcela)];
  const irr = calculateIRR(fluxo, taxaAmPct / 100);
  return irr > 0 && irr < 50 ? irr : taxaAmPct;
}

export function buildSimulacaoFundo(
  input: SimulacaoFundoInput,
  opts: { codigo: string; geradaEm: string },
): SimulacaoFundoResult {
  const P = input.valorCredito;
  const iofCfg = IOF_FUNDO[input.iof];

  const linhas: LinhaSimulacaoFundo[] = [...input.prazos]
    .sort((a, b) => a.meses - b.meses || a.taxaAm - b.taxaAm)
    .map(({ meses, taxaAm }) => {
      const iof = iofPrice(P, taxaAm, meses, iofCfg);
      const totalFinanciado = P + iof;
      const parcela = calculatePricePMT(totalFinanciado, taxaAm, meses);
      const cet = cetAm(P, parcela, meses, taxaAm);
      return {
        meses,
        taxaAm,
        taxaAa: anualiza(taxaAm),
        iof,
        totalFinanciado,
        parcela,
        totalPago: parcela * meses,
        cetAm: cet,
        cetAa: anualiza(cet),
      };
    });

  return {
    ...input,
    codigo: opts.codigo,
    geradaEm: opts.geradaEm,
    validaAte: somaDiasYmd(opts.geradaEm, VALIDADE_SIMULACAO_FUNDO_DIAS),
    linhas,
    menorParcela: linhas.reduce((a, b) => (b.parcela < a.parcela ? b : a), linhas[0]!),
  };
}
