import { z } from "zod";

import { ATIVIDADE_TIPOS, type AtividadeTipo } from "./types";

// ============================================================================
// Parse de filtros da query string (/atividades?periodo=hoje&...)
// ============================================================================

const PERIODO_VALUES = [
  "hoje",
  "ontem",
  "semana",   // últimos 7 dias
  "30d",      // últimos 30 dias
  "mes",      // mês corrente (1º do mês até agora)
  "personalizado",
] as const;

const TIPO_FILTER_VALUES = [...ATIVIDADE_TIPOS, "__all__"] as const;

export const atividadesFiltersSchema = z.object({
  periodo: z.enum(PERIODO_VALUES).default("hoje"),
  dataDe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** UUID ou "__all__" (default). */
  consultorId: z.string().optional(),
  /** Tipo ou "__all__" (default). */
  tipo: z.enum(TIPO_FILTER_VALUES).optional(),
});

export type AtividadesFilters = z.infer<typeof atividadesFiltersSchema>;

export type AtividadesPeriodo = (typeof PERIODO_VALUES)[number];

export const PERIODO_LABELS: Record<AtividadesPeriodo, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  semana: "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes: "Mês corrente",
  personalizado: "Personalizado",
};

/**
 * Resolve filtros pra um range [from, to) no timezone do servidor.
 *
 * Por que [from, to) (half-open): facilita "tudo do dia 15" virar
 * `>= 2026-05-15T00:00:00 AND < 2026-05-16T00:00:00` sem precisar
 * mexer em precisão de milissegundo.
 *
 * Timezone: usa servidor (Vercel = UTC). Pra "hoje" do consultor BR,
 * a borda do dia tá errada por 3h. Não vou resolver agora — futuro
 * podemos passar timezone do client. Pra v1 é aceitável; o trade-off
 * é que "hoje" às 02h da manhã BRT já mostra atividades de "ontem BR".
 */
export function resolveDateRange(filters: AtividadesFilters): {
  from: Date;
  to: Date;
} {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    return out;
  };
  const endOfDay = (d: Date) => {
    const out = new Date(d);
    out.setHours(23, 59, 59, 999);
    return out;
  };

  switch (filters.periodo) {
    case "hoje": {
      return { from: startOfDay(now), to: endOfDay(now) };
    }
    case "ontem": {
      const ontem = new Date(now);
      ontem.setDate(ontem.getDate() - 1);
      return { from: startOfDay(ontem), to: endOfDay(ontem) };
    }
    case "semana": {
      const inicio = new Date(now);
      inicio.setDate(inicio.getDate() - 6);
      return { from: startOfDay(inicio), to: endOfDay(now) };
    }
    case "30d": {
      const inicio = new Date(now);
      inicio.setDate(inicio.getDate() - 29);
      return { from: startOfDay(inicio), to: endOfDay(now) };
    }
    case "mes": {
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(inicio), to: endOfDay(now) };
    }
    case "personalizado": {
      const from = filters.dataDe
        ? startOfDay(new Date(`${filters.dataDe}T12:00:00`))
        : startOfDay(now);
      const to = filters.dataAte
        ? endOfDay(new Date(`${filters.dataAte}T12:00:00`))
        : endOfDay(now);
      return { from, to };
    }
  }
}

/**
 * Resolve tipo do filtro pra uma lista de tipos de atividade.
 * "__all__" ou undefined → todos os tipos. Tipo específico → array de 1.
 */
export function resolveTipos(filters: AtividadesFilters): AtividadeTipo[] | null {
  if (!filters.tipo || filters.tipo === "__all__") return null;
  return [filters.tipo as AtividadeTipo];
}

/** Resolve consultor: "__all__"/undefined → null (sem filtro). */
export function resolveConsultor(filters: AtividadesFilters): string | null {
  if (!filters.consultorId || filters.consultorId === "__all__") return null;
  return filters.consultorId;
}
