import { z } from "zod";

export const statusTarefaSchema = z.enum(["aberta", "concluida", "atrasada"]);
export const acaoTarefaSchema = z.enum([
  "liguei",
  "enviei_whatsapp",
  "recebi_resposta",
  "cobrei_documentacao",
  "atualizei_retorno_banco",
  "atualizei_banco_parceiro",
  "cliente_pediu_retorno",
  "nao_consegui_contato",
  "outro",
]);

export const listTasksQuerySchema = z.object({
  status: statusTarefaSchema.or(z.literal("todas")).default("aberta"),
  consultorId: z.string().uuid().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const completeTaskSchema = z
  .object({
    acao: acaoTarefaSchema,
    observacao: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.acao !== "outro" || Boolean(v.observacao?.trim()), {
    message: "Observação obrigatória quando a ação for Outro.",
    path: ["observacao"],
  });

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

export type StatusTarefa = z.infer<typeof statusTarefaSchema>;
export type AcaoTarefa = z.infer<typeof acaoTarefaSchema>;
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;
export type CreateLeadBancoInput = z.infer<typeof createLeadBancoSchema>;
