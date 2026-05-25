import { z } from "zod";

/**
 * Schemas de validação para propostas em bancos parceiros vinculadas
 * a um lead. Mantidos isolados aqui (separados de qualquer validador
 * relacionado a tarefas, que foi descontinuado).
 */

export const bancoStatusSchema = z.enum([
  "enviado",
  "em_analise",
  "aprovado",
  "recusado",
  "pendencia",
  "proposta_emitida",
]);

export const createLeadBancoSchema = z.object({
  banco: z.string().trim().min(1).max(80),
  status: bancoStatusSchema.default("enviado"),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export const updateLeadBancoSchema = z.object({
  status: bancoStatusSchema.optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
});

export type CreateLeadBancoInput = z.infer<typeof createLeadBancoSchema>;
