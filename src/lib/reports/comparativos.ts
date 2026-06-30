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
