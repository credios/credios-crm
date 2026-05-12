import { z } from "zod";

// ============================================================================
// Anotações livres sobre o lead
// ============================================================================
// Tabela `lead_anotacoes` (migration 0020). Editáveis pelo admin ou
// consultor atribuído; exclusão só admin.
//
// Constraints:
//   - título: opcional, max 100 chars
//   - conteúdo: obrigatório, 1-10.000 chars (~2 páginas A4)
//   - texto puro (UI usa whitespace-pre-wrap pra preservar quebras de linha)
// ============================================================================

export const createAnotacaoSchema = z.object({
  titulo: z.string().trim().max(100).nullish().transform((v) => (v?.trim() ? v.trim() : null)),
  conteudo: z
    .string()
    .trim()
    .min(1, "Conteúdo é obrigatório")
    .max(10_000, "Máximo 10.000 caracteres"),
});

export const updateAnotacaoSchema = z.object({
  titulo: z.string().trim().max(100).nullish().transform((v) => (v?.trim() ? v.trim() : null)),
  conteudo: z
    .string()
    .trim()
    .min(1, "Conteúdo não pode ser vazio")
    .max(10_000, "Máximo 10.000 caracteres"),
});

export type CreateAnotacaoInput = z.infer<typeof createAnotacaoSchema>;
export type UpdateAnotacaoInput = z.infer<typeof updateAnotacaoSchema>;
