import { z } from "zod";

const statusKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case");

/**
 * Upsert de config de tarefa. PATCH com chave (statusKey) — se existe edita,
 * se não cria. Frequência [1, 30] dias — bate com CHECK do banco.
 */
export const upsertTaskConfigSchema = z.object({
  statusKey: statusKeySchema,
  ativo: z.boolean().default(true),
  titulo: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(500).nullable().optional(),
  frequenciaDias: z
    .number()
    .int()
    .min(1, "Frequência mínima: 1 dia")
    .max(30, "Frequência máxima: 30 dias"),
});
export type UpsertTaskConfigInput = z.infer<typeof upsertTaskConfigSchema>;

export const patchTaskConfigSchema = z.object({
  ativo: z.boolean().optional(),
  titulo: z.string().trim().min(2).max(200).optional(),
  descricao: z.string().trim().max(500).nullable().optional(),
  frequenciaDias: z.number().int().min(1).max(30).optional(),
});
export type PatchTaskConfigInput = z.infer<typeof patchTaskConfigSchema>;
