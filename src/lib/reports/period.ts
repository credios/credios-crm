import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
} from "date-fns";

import type { PeriodoPreset, ReportFilters } from "@/lib/validators/report";

export type PeriodRange = {
  from: Date;
  to: Date;
  /** Label legível pra UI. */
  label: string;
};

export function periodFromFilters(filters: ReportFilters, now: Date = new Date()): PeriodRange {
  const preset: PeriodoPreset = filters.periodo;
  switch (preset) {
    case "7d":
      return { from: subDays(now, 7), to: now, label: "Últimos 7 dias" };
    case "30d":
      return { from: subDays(now, 30), to: now, label: "Últimos 30 dias" };
    case "90d":
      return { from: subDays(now, 90), to: now, label: "Últimos 90 dias" };
    case "mes_atual":
      return { from: startOfMonth(now), to: endOfMonth(now), label: "Mês atual" };
    case "trimestre":
      return { from: startOfQuarter(now), to: endOfQuarter(now), label: "Trimestre atual" };
    case "ano":
      return { from: startOfYear(now), to: endOfYear(now), label: "Ano atual" };
    case "custom": {
      const from = filters.dataDe ? new Date(`${filters.dataDe}T00:00:00Z`) : subDays(now, 30);
      const to = filters.dataAte ? new Date(`${filters.dataAte}T23:59:59Z`) : now;
      return { from, to, label: "Período custom" };
    }
  }
}
