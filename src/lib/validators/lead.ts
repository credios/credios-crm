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

const TIPO_INTERACAO_VALUES = [
  "ligacao",
  "whatsapp_enviado",
  "whatsapp_recebido",
  "email",
  "reuniao",
  "anotacao",
  "documento_recebido",
] as const;

export const statusLeadEnum = z.enum(STATUS_LEAD_VALUES);
export const tipoInteracaoEnum = z.enum(TIPO_INTERACAO_VALUES);

const cents = z.coerce.number().int().nonnegative();
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v == null || v === "" ? null : v));

/** Schema canônico de criação manual de lead (UI / POST /api/leads). */
export const createLeadSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  cpf: optionalString,
  estadoCivil: optionalString,
  ocupacao: optionalString,
  rendaMensalCentavos: cents.nullable().optional(),
  whatsapp: z.string().trim().min(8),
  email: z.string().trim().email().nullable().optional().or(z.literal("").transform(() => null)),
  cidade: optionalString,
  estado: z.string().trim().length(2).nullable().optional().or(z.literal("").transform(() => null)),

  produto: z.string().default("CGI"),
  objetivoCredito: optionalString,
  tipoImovel: optionalString,
  situacaoImovel: optionalString,
  tipoPessoa: optionalString,
  valorImovelCentavos: cents.nullable().optional(),
  valorCreditoCentavos: cents.nullable().optional(),

  consultorId: z.uuid().nullable().optional(),

  origem: optionalString.default("Manual"),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/** Schema de atualização parcial (PATCH /api/leads/[id]). */
export const updateLeadSchema = createLeadSchema.partial().omit({ produto: true });
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/**
 * Schema discriminado para mudanças de status. Estados terminais (fechado/
 * desqualificado/perdido) exigem campos extras conforme CLAUDE.md §6.5.
 */
export const updateStatusSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("fechado"),
    bancoAprovador: z.string().trim().min(1, "Banco aprovador obrigatório"),
    valorLiberadoCentavos: cents,
    comissaoCentavos: cents,
    dataFechamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use formato YYYY-MM-DD"),
  }),
  z.object({
    status: z.enum(["desqualificado", "perdido"]),
    motivoDesqualificacao: z.string().trim().min(1, "Motivo obrigatório"),
  }),
  z.object({
    status: z.enum([
      "novo",
      "conversa_inicial",
      "aguardando_resposta",
      "aguardando_documentacao",
      "documentacao_enviada",
      "em_negociacao",
      "sem_resposta",
    ]),
  }),
]);
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const reassignSchema = z.object({
  consultorId: z.uuid().nullable(),
});
export type ReassignInput = z.infer<typeof reassignSchema>;

export const createInteracaoSchema = z.object({
  tipo: tipoInteracaoEnum,
  conteudo: optionalString,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type CreateInteracaoInput = z.infer<typeof createInteracaoSchema>;

export const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  status: statusLeadEnum.optional(),
  consultorId: z.string().optional(),
  origem: z.string().optional(),
  estado: z.string().optional(),
  dispositivo: z.string().optional(),
  q: z.string().optional(),
  valorMin: z.coerce.number().int().nonnegative().optional(),
  valorMax: z.coerce.number().int().nonnegative().optional(),
  dataDe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataAte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export type StatusLead = z.infer<typeof statusLeadEnum>;
export type TipoInteracao = z.infer<typeof tipoInteracaoEnum>;
