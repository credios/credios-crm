// ═══════════════════════════════════════════════════════════
// Simulador simplificado — motor de cálculo (CRM)
// Portado direto do credios-website-v2 (/lib/simple-simulator.ts).
// Funções puras, testáveis, sem efeitos colaterais.
// Cobre as 4 combinações: SAC × PRICE, Pré × Pós-fixado.
//
// Nota: pós-fixado NÃO projeta IPCA — usa a mesma matemática
// do pré em cima da taxa informada. A diferença vive no rótulo
// e no disclaimer do PDF.
// ═══════════════════════════════════════════════════════════

import { calculatePricePMT, calculateIRR } from "./financial";

// IOF fixo (3,38% do crédito) — convenção compartilhada com o site.
export const IOF_RATE = 0.0338;

// Outras despesas (avaliação, cartório, estruturação).
export const OTHER_EXPENSES_RATE = 0.02;

// Validade padrão da proposta.
export const DEFAULT_VALIDITY_DAYS = 30;

export type AmortizationType = "price" | "sac";
export type Indexation = "pre" | "pos";

export interface SimpleSimulationInput {
  clientName: string;
  clientCPF: string;
  creditAmount: number;
  propertyValue: number;
  interestRate: number; // taxa mensal em % (ex: 1.19)
  installments: number; // prazo em meses
  amortizationType: AmortizationType;
  indexation: Indexation;
}

export interface SimpleAmortizationRow {
  month: number; // 1..n
  dueDate: string; // DD/MM/AAAA
  amortization: number;
  interest: number;
  payment: number;
  balance: number; // saldo devedor após a parcela
}

export interface SimpleSimulationResult {
  // identificação
  simulationId: string;
  generatedAt: string; // ISO date (YYYY-MM-DD)
  validUntil: string; // ISO date
  validityDays: number;

  // dados de entrada espelhados
  clientName: string;
  clientCPF: string;
  creditAmount: number;
  propertyValue: number;
  ltv: number; // % 0-100
  interestRate: number; // % mensal
  annualRate: number; // % anual (equivalente)
  installments: number;
  amortizationType: AmortizationType;
  indexation: Indexation;

  // derivados
  iof: number;
  otherExpenses: number; // avaliação, cartório, estruturação
  financedAmount: number; // creditAmount + iof + otherExpenses (PV das parcelas)
  firstPayment: number;
  lastPayment: number;
  averagePayment: number;
  totalInterest: number;
  totalAmortization: number;
  totalPaid: number;
  cet: number; // % mensal
  annualCet: number; // % anual
  amortizationTable: SimpleAmortizationRow[];
}

// ---------- helpers ----------

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Corrige overflow quando o mês destino tem menos dias.
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function formatBrDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toIsoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ---------- núcleo ----------

interface BuildOptions {
  simulationId: string;
  generatedAt?: Date;
  validityDays?: number;
}

/**
 * Monta o resultado completo da simulação a partir dos inputs.
 * Não valida — espera que o caller já tenha validado via Zod.
 */
export function buildSimulationResult(
  input: SimpleSimulationInput,
  opts: BuildOptions,
): SimpleSimulationResult {
  const {
    clientName,
    clientCPF,
    creditAmount,
    propertyValue,
    interestRate,
    installments,
    amortizationType,
    indexation,
  } = input;

  const generatedAt = opts.generatedAt ?? new Date();
  const validityDays = opts.validityDays ?? DEFAULT_VALIDITY_DAYS;
  const validUntilDate = new Date(generatedAt);
  validUntilDate.setDate(validUntilDate.getDate() + validityDays);

  const monthlyRate = interestRate / 100;
  const annualRate = (Math.pow(1 + monthlyRate, 12) - 1) * 100;
  const ltv = (creditAmount / propertyValue) * 100;

  // IOF e demais despesas são SOMADOS ao crédito para compor o PV.
  // O cliente recebe integralmente o `creditAmount`; o banco financia
  // o valor total (crédito + IOF + despesas) em parcelas.
  const iof = creditAmount * IOF_RATE;
  const otherExpenses = creditAmount * OTHER_EXPENSES_RATE;
  const financedAmount = creditAmount + iof + otherExpenses;

  // Tabela de amortização — PV = financedAmount.
  const amortizationTable: SimpleAmortizationRow[] = [];
  let balance = financedAmount;

  if (amortizationType === "price") {
    const pmt = calculatePricePMT(financedAmount, interestRate, installments);
    for (let m = 1; m <= installments; m++) {
      const interest = balance * monthlyRate;
      const amortization = pmt - interest;
      balance = Math.max(0, balance - amortization);
      amortizationTable.push({
        month: m,
        dueDate: formatBrDate(addMonths(generatedAt, m)),
        amortization,
        interest,
        payment: pmt,
        balance: balance < 0.01 ? 0 : balance,
      });
    }
  } else {
    // SAC
    const amortization = financedAmount / installments;
    for (let m = 1; m <= installments; m++) {
      const interest = balance * monthlyRate;
      const payment = amortization + interest;
      balance = Math.max(0, balance - amortization);
      amortizationTable.push({
        month: m,
        dueDate: formatBrDate(addMonths(generatedAt, m)),
        amortization,
        interest,
        payment,
        balance: balance < 0.01 ? 0 : balance,
      });
    }
  }

  const firstPayment = amortizationTable[0].payment;
  const lastPayment = amortizationTable[amortizationTable.length - 1].payment;
  const totalAmortization = amortizationTable.reduce(
    (s, r) => s + r.amortization,
    0,
  );
  const totalInterest = amortizationTable.reduce((s, r) => s + r.interest, 0);
  const totalPaid = amortizationTable.reduce((s, r) => s + r.payment, 0);
  const averagePayment = totalPaid / installments;

  // CET — TIR do fluxo de caixa do cliente:
  //   mês 0: +creditAmount  (recebe o líquido do empréstimo)
  //   mês k: -parcela       (paga o financiamento que inclui IOF+despesas)
  // Pra calculateIRR (que espera primeiro valor negativo), invertemos:
  //   [-creditAmount, parcelas...] — perspectiva do banco.
  const cashFlow = [-creditAmount, ...amortizationTable.map((r) => r.payment)];
  let cet = interestRate;
  try {
    const irr = calculateIRR(cashFlow, monthlyRate);
    if (irr > 0 && irr < 50) cet = irr;
  } catch {
    /* mantém fallback = taxa nominal */
  }
  const annualCet = (Math.pow(1 + cet / 100, 12) - 1) * 100;

  return {
    simulationId: opts.simulationId,
    generatedAt: toIsoDate(generatedAt),
    validUntil: toIsoDate(validUntilDate),
    validityDays,

    clientName,
    clientCPF,
    creditAmount,
    propertyValue,
    ltv,
    interestRate,
    annualRate,
    installments,
    amortizationType,
    indexation,

    iof,
    otherExpenses,
    financedAmount,
    firstPayment,
    lastPayment,
    averagePayment,
    totalInterest,
    totalAmortization,
    totalPaid,
    cet,
    annualCet,
    amortizationTable,
  };
}

export type CreateSimpleSimulationResponse =
  | { success: true; data: SimpleSimulationResult }
  | { success: false; error: string };
