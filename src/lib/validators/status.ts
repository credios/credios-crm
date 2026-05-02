import { z } from "zod";

const keySchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case (a-z, 0-9, _, começando com letra)");

const corSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use formato #RRGGBB")
  .nullable()
  .optional();

/**
 * Criar status custom. Não permite `e_sistema` — sempre false.
 * Cor opcional. Ordem default 1000 (vai pro fim; admin reordena depois).
 */
export const createStatusSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(80),
  eTerminal: z.boolean().default(false),
  cor: corSchema,
});
export type CreateStatusInput = z.infer<typeof createStatusSchema>;

/**
 * Atualizar status. Sistema só pode mudar `label`, `cor`, `ativo`,
 * `eTerminal`, `ordem`. Custom pode mudar tudo exceto `key` e `eSistema`.
 *
 * `cascadeTo` é o key alvo pra reassign quando desativando — opcional;
 * se ausente o backend escolhe o anterior por ordem.
 */
export const updateStatusSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  ativo: z.boolean().optional(),
  eTerminal: z.boolean().optional(),
  cor: corSchema,
  ordem: z.number().int().nonnegative().optional(),
  cascadeTo: keySchema.optional(),
});
export type UpdateStatusConfigInput = z.infer<typeof updateStatusSchema>;

/** Reordenação em massa: [{key, ordem}, ...]. */
export const reorderStatusSchema = z.object({
  ordem: z.array(
    z.object({
      key: keySchema,
      ordem: z.number().int().nonnegative(),
    }),
  ),
});
export type ReorderStatusInput = z.infer<typeof reorderStatusSchema>;
