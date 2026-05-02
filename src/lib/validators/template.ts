import { z } from "zod";

const STATUS_LEAD_VALUES = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "fechado",
  "perdido",
  "sem_resposta",
  "desqualificado",
] as const;

export const upsertTemplateSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(100),
  conteudo: z
    .string()
    .trim()
    .min(5, "Conteúdo muito curto")
    .max(2000, "Conteúdo muito longo (máx 2000)"),
  statusAplicavel: z
    .array(z.enum(STATUS_LEAD_VALUES))
    .min(1, "Selecione pelo menos 1 status"),
  ativa: z.boolean().optional().default(true),
});
export type UpsertTemplateInput = z.infer<typeof upsertTemplateSchema>;

export const reorderTemplatesSchema = z.object({
  ids: z.array(z.uuid()).min(1),
});
export type ReorderTemplatesInput = z.infer<typeof reorderTemplatesSchema>;
