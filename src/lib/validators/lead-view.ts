import { z } from "zod";

// ============================================================================
// Visualizações salvas (presets de filtro) das telas de leads.
// ============================================================================

export const VIEW_MODES = ["lista", "kanban"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/**
 * Params da URL que fazem sentido persistir numa visualização. Lista branca —
 * tudo fora disso (ex.: `page`) é descartado ao salvar. Espelha os filtros de
 * `listLeadsQuerySchema`.
 */
export const FILTRO_KEYS = [
  "status",
  "consultorId",
  "origem",
  "source",
  "channel",
  "estado",
  "dispositivo",
  "q",
  "valorMin",
  "valorMax",
  "dataDe",
  "dataAte",
  "sortBy",
  "sortDir",
  "incluirEncerrados",
  "incluirFechados",
] as const;

const FILTRO_KEY_SET: ReadonlySet<string> = new Set(FILTRO_KEYS);

/** Mantém só as chaves permitidas e valores string não-vazios. */
export function sanitizeFiltros(
  input: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!FILTRO_KEY_SET.has(k)) continue;
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed === "") continue;
    out[k] = trimmed;
  }
  return out;
}

export const createSavedViewSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Dê um nome à visualização")
    .max(60, "Máximo de 60 caracteres"),
  viewMode: z.enum(VIEW_MODES),
  // Aceita qualquer record de strings; o endpoint aplica sanitizeFiltros.
  filtros: z.record(z.string(), z.string()).default({}),
});
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;

/** Forma serializada enviada ao client (createdAt em ISO). */
export type SavedLeadView = {
  id: string;
  nome: string;
  viewMode: ViewMode;
  filtros: Record<string, string>;
  createdAt: string;
};

/** Teto por usuário — evita crescimento sem limite do menu. */
export const MAX_SAVED_VIEWS = 50;
