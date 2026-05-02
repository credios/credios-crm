import { z } from "zod";

export const PERIODO_PRESETS = [
  "7d",
  "30d",
  "90d",
  "mes_atual",
  "trimestre",
  "ano",
  "custom",
] as const;
export type PeriodoPreset = (typeof PERIODO_PRESETS)[number];

export const reportFiltersSchema = z.object({
  periodo: z.enum(PERIODO_PRESETS).default("30d"),
  dataDe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  origem: z.string().optional(),
  consultorId: z.string().optional(),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  mes_atual: "Mês atual",
  trimestre: "Trimestre atual",
  ano: "Ano atual",
  custom: "Período custom",
};
