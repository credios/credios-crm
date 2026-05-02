import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";

import { endOfDayBrt, startOfDayBrt } from "@/lib/datetime/brt";
import type { PeriodoPreset, ReportFilters } from "@/lib/validators/report";

export type PeriodRange = {
  from: Date;
  to: Date;
  /** Label legível pra UI. */
  label: string;
  /** Preset original (pra escolha de comparativo etc). */
  preset: PeriodoPreset;
};

export function periodFromFilters(
  filters: ReportFilters,
  now: Date = new Date(),
): PeriodRange {
  const preset: PeriodoPreset = filters.periodo;
  switch (preset) {
    case "hoje":
      return {
        from: startOfDay(now),
        to: endOfDay(now),
        label: "Hoje",
        preset,
      };
    case "7d":
      return { from: subDays(now, 7), to: now, label: "Últimos 7 dias", preset };
    case "30d":
      return {
        from: subDays(now, 30),
        to: now,
        label: "Últimos 30 dias",
        preset,
      };
    case "90d":
      return {
        from: subDays(now, 90),
        to: now,
        label: "Últimos 90 dias",
        preset,
      };
    case "mes_atual":
      return {
        from: startOfMonth(now),
        to: endOfMonth(now),
        label: "Mês atual",
        preset,
      };
    case "mes_anterior": {
      const prev = subMonths(now, 1);
      return {
        from: startOfMonth(prev),
        to: endOfMonth(prev),
        label: "Mês anterior",
        preset,
      };
    }
    case "trimestre":
      return {
        from: startOfQuarter(now),
        to: endOfQuarter(now),
        label: "Trimestre atual",
        preset,
      };
    case "ano":
      return {
        from: startOfYear(now),
        to: endOfYear(now),
        label: "Ano atual",
        preset,
      };
    case "ultimos_12m":
      return {
        from: subMonths(now, 12),
        to: now,
        label: "Últimos 12 meses",
        preset,
      };
    case "custom": {
      const from = filters.dataDe
        ? startOfDayBrt(filters.dataDe)
        : subDays(now, 30);
      const to = filters.dataAte
        ? endOfDayBrt(filters.dataAte)
        : now;
      return { from, to, label: "Período custom", preset };
    }
  }
}
