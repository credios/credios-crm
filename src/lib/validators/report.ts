import { z } from "zod";

export const PERIODO_PRESETS = [
  "hoje",
  "7d",
  "30d",
  "90d",
  "mes_atual",
  "mes_anterior",
  "trimestre",
  "ano",
  "ultimos_12m",
  "custom",
] as const;
export type PeriodoPreset = (typeof PERIODO_PRESETS)[number];

export const COMPARACAO_MODES = [
  "anterior_equivalente",
  "ano_passado",
  "sem",
] as const;
export type ComparacaoMode = (typeof COMPARACAO_MODES)[number];

// Helper: aceita string ou string[] na URL e normaliza pra array.
// Útil pra `?consultorIds=a,b,c` ou `?consultorIds=a&consultorIds=b`.
const csvOrArray = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => {
    if (Array.isArray(v)) return v.filter(Boolean);
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  });

export const reportFiltersSchema = z.object({
  periodo: z.enum(PERIODO_PRESETS).default("30d"),
  dataDe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

  // Multi-select: arrays normalizadas. Vazio = "todos".
  consultorIds: csvOrArray.default([]),
  origens: csvOrArray.default([]),
  ufs: csvOrArray.default([]),

  // Faixa de valor de crédito buscado (centavos).
  valorMinCentavos: z.coerce.number().int().nonnegative().optional(),
  valorMaxCentavos: z.coerce.number().int().nonnegative().optional(),

  // Compatibilidade temporária: aceita os antigos single-select e mescla nos arrays.
  consultorId: z.string().optional(),
  origem: z.string().optional(),

  // Modo de comparação (página executiva).
  comparar: z.enum(COMPARACAO_MODES).default("anterior_equivalente"),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** Normaliza filtros: mescla legacy single-select nos arrays. */
export function normalizeFilters(f: ReportFilters): ReportFilters {
  const consultorIds = [...f.consultorIds];
  if (f.consultorId && !consultorIds.includes(f.consultorId))
    consultorIds.push(f.consultorId);
  const origens = [...f.origens];
  if (f.origem && !origens.includes(f.origem)) origens.push(f.origem);
  return { ...f, consultorIds, origens };
}

export const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  mes_atual: "Mês atual",
  mes_anterior: "Mês anterior",
  trimestre: "Trimestre atual",
  ano: "Ano atual",
  ultimos_12m: "Últimos 12 meses",
  custom: "Período custom",
};

export const COMPARACAO_LABEL: Record<ComparacaoMode, string> = {
  anterior_equivalente: "Período anterior equivalente",
  ano_passado: "Mesmo período ano passado",
  sem: "Sem comparação",
};
