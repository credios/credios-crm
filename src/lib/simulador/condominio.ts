// ═══════════════════════════════════════════════════════════
// Simulação de CRÉDITO PARA CONDOMÍNIO — motor de cálculo puro.
//
// Gerada pelo parceiro no portal (PDF com o nome dele). Taxa por prazo vem
// da config do admin (/configuracoes/simulacao-condominio); o parceiro só
// informa condomínio, CNPJ, valor e, opcionalmente, unidades.
//
// Por prazo: Tabela Price sobre crédito + IOF financiado.
//   IOF = adicional × crédito + Σ amortizaçãoₖ × diária × min(30·k, 365)
//   (cronograma Price do crédito; meses de 30 dias; teto de 365 dias da
//   alíquota diária, como no Decreto 6.306/2007)
//   CET = TIR do fluxo do condomínio: recebe o crédito, paga as parcelas.
// ═══════════════════════════════════════════════════════════

import type { SimulacaoCondominioConfig } from "./condominio-config";
import { calculateIRR, calculatePricePMT } from "./financial";

export type SimulacaoCondominioInput = {
  condominioNome: string;
  /** Só dígitos/letras (CNPJ alfanumérico aceito). */
  cnpj: string;
  /** Reais. */
  valorCredito: number;
  numUnidades?: number | null;
  finalidade?: string | null;
  parceiro: {
    nome: string;
    /** Quem gerou (usuário do portal), quando diferente do parceiro. */
    responsavel?: string | null;
    email?: string | null;
    telefone?: string | null;
  };
};

export type LinhaPrazoCondominio = {
  meses: number;
  taxaAm: number;
  taxaAa: number;
  iof: number;
  totalFinanciado: number;
  parcela: number;
  totalPago: number;
  cetAm: number;
  cetAa: number;
  /** Parcela ÷ unidades (null sem nº de unidades). */
  porUnidade: number | null;
};

export type SimulacaoCondominioResult = SimulacaoCondominioInput & {
  codigo: string;
  geradaEm: string; // ISO date
  validaAte: string; // ISO date
  linhas: LinhaPrazoCondominio[];
  taxaMinAm: number;
  taxaMaxAm: number;
  prazoMin: number;
  prazoMax: number;
  /** Menor parcela da tabela (prazo mais longo, em geral). */
  menorParcela: LinhaPrazoCondominio;
  iofIncluido: boolean;
};

export const CODIGO_SIMULACAO_CONDOMINIO_REGEX = /^CD-\d{4}-\d{6}$/;

export function gerarCodigoSimulacaoCondominio(
  agora: Date = new Date(),
  rand: () => number = Math.random,
): string {
  const seq = Math.floor(rand() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `CD-${agora.getFullYear()}-${seq}`;
}

export function anualiza(taxaAmPct: number): number {
  return (Math.pow(1 + taxaAmPct / 100, 12) - 1) * 100;
}

/** IOF de um crédito amortizado pela Price (sem financiar o próprio IOF). */
export function iofPrice(
  principal: number,
  taxaAmPct: number,
  meses: number,
  cfg: Pick<SimulacaoCondominioConfig, "iofAdicionalPct" | "iofDiarioPct">,
): number {
  const adicional = principal * (cfg.iofAdicionalPct / 100);
  if (cfg.iofDiarioPct <= 0) return adicional;
  const pmt = calculatePricePMT(principal, taxaAmPct, meses);
  const i = taxaAmPct / 100;
  let saldo = principal;
  let diario = 0;
  for (let k = 1; k <= meses; k++) {
    const amort = pmt - saldo * i;
    saldo -= amort;
    diario += amort * (cfg.iofDiarioPct / 100) * Math.min(30 * k, 365);
  }
  return adicional + diario;
}

function cetAm(credito: number, parcela: number, meses: number, taxaAmPct: number): number {
  const fluxo = [-credito, ...Array.from({ length: meses }, () => parcela)];
  try {
    const irr = calculateIRR(fluxo, taxaAmPct / 100);
    if (irr > 0 && irr < 50) return irr;
  } catch {
    /* fallback abaixo */
  }
  return taxaAmPct;
}

const toIsoDate = (d: Date) => d.toISOString().split("T")[0]!;

export function buildSimulacaoCondominio(
  input: SimulacaoCondominioInput,
  config: Pick<
    SimulacaoCondominioConfig,
    "prazos" | "validadeDias" | "iofAdicionalPct" | "iofDiarioPct"
  >,
  opts: { codigo: string; geradaEm?: Date },
): SimulacaoCondominioResult {
  const gerada = opts.geradaEm ?? new Date();
  const validade = new Date(gerada);
  validade.setDate(validade.getDate() + config.validadeDias);

  const P = input.valorCredito;
  const unidades = input.numUnidades && input.numUnidades > 0 ? input.numUnidades : null;

  const linhas: LinhaPrazoCondominio[] = config.prazos.map(({ meses, taxaAm }) => {
    const iof = iofPrice(P, taxaAm, meses, config);
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
      porUnidade: unidades ? parcela / unidades : null,
    };
  });

  const taxas = linhas.map((l) => l.taxaAm);
  const menorParcela = linhas.reduce((a, b) => (b.parcela < a.parcela ? b : a), linhas[0]!);

  return {
    ...input,
    numUnidades: unidades,
    codigo: opts.codigo,
    geradaEm: toIsoDate(gerada),
    validaAte: toIsoDate(validade),
    linhas,
    taxaMinAm: Math.min(...taxas),
    taxaMaxAm: Math.max(...taxas),
    prazoMin: linhas[0]!.meses,
    prazoMax: linhas[linhas.length - 1]!.meses,
    menorParcela,
    iofIncluido: config.iofAdicionalPct > 0 || config.iofDiarioPct > 0,
  };
}
