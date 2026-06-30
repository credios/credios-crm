import {
  differenceInCalendarDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";

import type { ComparacaoMode } from "@/lib/validators/report";

import type { PeriodRange } from "./period";

/**
 * Período anterior equivalente ao período dado.
 * Se for preset baseado em mês/trimestre/ano, retorna o equivalente passado;
 * se for "últimos N dias" ou "custom", retorna a janela de mesmo tamanho
 * imediatamente anterior.
 */
export function previousPeriod(p: PeriodRange): PeriodRange {
  switch (p.preset) {
    case "mes_atual": {
      const prev = subMonths(p.from, 1);
      return {
        from: startOfMonth(prev),
        to: endOfMonth(prev),
        label: "Mês anterior",
        preset: "mes_anterior",
      };
    }
    case "mes_anterior": {
      const prev = subMonths(p.from, 1);
      return {
        from: startOfMonth(prev),
        to: endOfMonth(prev),
        label: "Mês retrasado",
        preset: "custom",
      };
    }
    case "trimestre": {
      const prev = subMonths(p.from, 3);
      return {
        from: startOfQuarter(prev),
        to: endOfQuarter(prev),
        label: "Trimestre anterior",
        preset: "custom",
      };
    }
    case "ano": {
      const prev = subYears(p.from, 1);
      return {
        from: startOfYear(prev),
        to: endOfYear(prev),
        label: "Ano anterior",
        preset: "custom",
      };
    }
    default: {
      // Janela de mesmo tamanho imediatamente anterior.
      const days = Math.max(1, differenceInCalendarDays(p.to, p.from));
      const to = subDays(p.from, 1);
      const from = subDays(to, days);
      return {
        from,
        to,
        label: `${days}d anteriores`,
        preset: "custom",
      };
    }
  }
}

/** Mesmo período exato 1 ano atrás. */
export function samePeriodLastYear(p: PeriodRange): PeriodRange {
  return {
    from: subYears(p.from, 1),
    to: subYears(p.to, 1),
    label: `${p.label} (ano passado)`,
    preset: "custom",
  };
}

/** Resolve período de comparação conforme escolha do user. Null = sem comparação. */
export function comparisonPeriod(
  p: PeriodRange,
  mode: ComparacaoMode,
): PeriodRange | null {
  switch (mode) {
    case "anterior_equivalente":
      return previousPeriod(p);
    case "ano_passado":
      return samePeriodLastYear(p);
    case "sem":
      return null;
  }
}

/**
 * Delta percentual de `curr` vs `prev`. Retorna null se prev=0 (indefinido).
 * Exemplo: prev=80, curr=100 → +25.0 (%).
 */
export function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

/**
 * Volume mínimo de leads na janela de comparação pra que QUALQUER delta da
 * página seja confiável. Abaixo disso, percentuais viram ruído
 * (ex.: prev=2, curr=348 → +17300%, que não diz nada útil).
 *
 * Caso real: a operação tem ~90 dias de histórico. Em períodos longos
 * (90d, trimestre, ano, 12m) a janela "anterior equivalente" cai ANTES da
 * operação existir, então tem ~1-2 leads e todo delta explode. Quando isso
 * acontece, escondemos os deltas em vez de mostrar números absurdos.
 */
export const MIN_COMPARISON_BASE = 10;

/**
 * Decide se a comparação contra o período anterior é estatisticamente útil.
 * Usa o VOLUME de leads da janela anterior como termômetro: se a janela mal
 * existia (poucos leads), nenhum delta da página deve ser exibido.
 *
 * @param prevLeadsCount total de leads no período de comparação (ou null se
 *   não há comparação configurada).
 */
export function isComparisonReliable(
  prevLeadsCount: number | null | undefined,
): boolean {
  return prevLeadsCount != null && prevLeadsCount >= MIN_COMPARISON_BASE;
}

/** Delta absoluto em pontos (pra taxas que já são %). */
export function pointsDelta(curr: number, prev: number): number {
  return curr - prev;
}

export type WithDelta<T extends number> = {
  curr: T;
  prev: T;
  deltaPct: number | null;
};

export function withDelta<T extends number>(
  curr: T,
  prev: T,
): WithDelta<T> {
  return { curr, prev, deltaPct: pctDelta(curr, prev) };
}
