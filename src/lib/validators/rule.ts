import { z } from "zod";

export const ACAO_TIPOS = [
  "atribuir_usuario",
  "round_robin_grupo",
  "pool_nao_atribuido",
] as const;

export const ruleCondicoesSchema = z
  .object({
    valor_credito_min: z.number().int().nonnegative().optional(),
    valor_credito_max: z.number().int().nonnegative().optional(),
    valor_imovel_min: z.number().int().nonnegative().optional(),
    valor_imovel_max: z.number().int().nonnegative().optional(),
    estado_in: z
      .array(z.string().regex(/^[A-Z]{2}$/, "UF inválida"))
      .min(1)
      .optional(),
    origem_in: z.array(z.string().min(1)).min(1).optional(),
    tipo_imovel_in: z.array(z.string().min(1)).min(1).optional(),
    horario_comercial: z.boolean().optional(),
  })
  .strict();

const baseRuleFields = {
  nome: z.string().trim().min(2, "Nome muito curto").max(200),
  ativa: z.boolean().optional().default(true),
  condicoes: ruleCondicoesSchema,
};

export const upsertRuleSchema = z.discriminatedUnion("acao", [
  z.object({
    ...baseRuleFields,
    acao: z.literal("atribuir_usuario"),
    parametros: z.object({ usuario_id: z.uuid() }),
  }),
  z.object({
    ...baseRuleFields,
    acao: z.literal("round_robin_grupo"),
    parametros: z.object({
      grupo_usuarios: z.array(z.uuid()).min(1, "Pelo menos 1 usuário"),
    }),
  }),
  z.object({
    ...baseRuleFields,
    acao: z.literal("pool_nao_atribuido"),
    parametros: z.object({}).optional().default({}),
  }),
]);
export type UpsertRuleInput = z.infer<typeof upsertRuleSchema>;

export const reorderRulesSchema = z.object({
  ids: z.array(z.uuid()).min(1),
});
export type ReorderRulesInput = z.infer<typeof reorderRulesSchema>;

export const testarRoteamentoSchema = z.object({
  valorCreditoCentavos: z.number().int().nonnegative().nullable().optional(),
  valorImovelCentavos: z.number().int().nonnegative().nullable().optional(),
  estado: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  origem: z.string().nullable().optional(),
  tipoImovel: z.string().nullable().optional(),
  horarioComercial: z.boolean().optional(),
});
export type TestarRoteamentoInput = z.infer<typeof testarRoteamentoSchema>;
