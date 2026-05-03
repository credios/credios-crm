import { z } from "zod";

import { SORT_LEAD_KEYS, type SortLeadKey } from "@/lib/leads/sort-options";

// Mantemos os 10 keys "sistema" (referenciadas direto no código pra modais
// e permissões). Status custom criadas pelo admin entram via DB e batem o
// validator de "qualquer string snake_case 1..50 chars".
export const SYSTEM_STATUS_LEAD_KEYS = [
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

// Aceita qualquer key de status — incluindo custom. Validação contra o que
// existe no banco fica no endpoint (precisa hit em DB).
const statusKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case (a-z, 0-9, _, começando com letra)");

export const statusLeadEnum = statusKeySchema;
export const tipoInteracaoEnum = z.enum(TIPO_INTERACAO_VALUES);

const cents = z.coerce.number().int().nonnegative();
// Aceita string, null OU undefined (form serializa campos vazios como null —
// optional() sozinho não cobre null, daí o nullish() + transform de "" → null).
const optionalString = z
  .string()
  .trim()
  .nullish()
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
  saldoDevedorCentavos: cents.nullable().optional(),
  valorCreditoCentavos: cents.nullable().optional(),

  consultorId: z.uuid().nullable().optional(),

  origem: optionalString.default("Manual"),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/** Schema de atualização parcial (PATCH /api/leads/[id]). */
export const updateLeadSchema = createLeadSchema.partial().omit({ produto: true });
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/**
 * Mudança de status. Estados terminais sistema (fechado/desqualificado/
 * perdido) exigem campos extras conforme CLAUDE.md §6.5; documentacao_enviada
 * e em_negociacao pedem bancos. Custom status (não-sistema) só precisa do key.
 *
 * Discriminated union não cobre statuses dinâmicos — usamos schema flat com
 * superRefine pra exigir campos condicionalmente.
 */
export const updateStatusSchema = z
  .object({
    status: statusKeySchema,
    bancoAprovador: z.string().trim().min(1).optional(),
    valorLiberadoCentavos: cents.optional(),
    comissaoCentavos: cents.optional(),
    dataFechamento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use formato YYYY-MM-DD")
      .optional(),
    motivoDesqualificacao: z.string().trim().min(1).optional(),
    bancos: z.array(z.string().trim().min(1).max(80)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "fechado") {
      if (!data.bancoAprovador) {
        ctx.addIssue({
          code: "custom",
          path: ["bancoAprovador"],
          message: "Banco aprovador obrigatório",
        });
      }
      if (data.valorLiberadoCentavos == null) {
        ctx.addIssue({
          code: "custom",
          path: ["valorLiberadoCentavos"],
          message: "Valor liberado obrigatório",
        });
      }
      if (data.comissaoCentavos == null) {
        ctx.addIssue({
          code: "custom",
          path: ["comissaoCentavos"],
          message: "Comissão obrigatória",
        });
      }
      if (!data.dataFechamento) {
        ctx.addIssue({
          code: "custom",
          path: ["dataFechamento"],
          message: "Data de fechamento obrigatória",
        });
      }
    }
    if (data.status === "desqualificado" || data.status === "perdido") {
      if (!data.motivoDesqualificacao) {
        ctx.addIssue({
          code: "custom",
          path: ["motivoDesqualificacao"],
          message: "Motivo obrigatório",
        });
      }
    }
    if (data.status === "documentacao_enviada" || data.status === "em_negociacao") {
      if (data.bancos != null && data.bancos.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["bancos"],
          message: "Informe ao menos um banco para este status",
        });
      }
    }
  });
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

export { SORT_LEAD_KEYS, type SortLeadKey };

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

  /** Ordenação. Default: criado_em desc (lead mais novo primeiro). */
  sortBy: z.enum(SORT_LEAD_KEYS).default("criado_em"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),

  /**
   * Por default leads em status terminal "perdido" e "desqualificado" ficam
   * ocultos pra não distrair o consultor (igual o CRM antigo no Notion). Pra
   * vê-los, passar `incluirEncerrados=1`. Se o user filtrou explicitamente
   * por um desses status, o filtro vence (mostra mesmo se incluirEncerrados=0).
   */
  incluirEncerrados: z
    .union([z.literal("1"), z.literal("0"), z.boolean()])
    .transform((v) => v === true || v === "1")
    .default(false),

  /**
   * Por default leads "fechado" também ficam ocultos — após a venda concluída,
   * não precisamos mais gastar energia neles. Pra vê-los, passar
   * `incluirFechados=1`. Se o user filtrou explicitamente por status='fechado',
   * o filtro vence.
   */
  incluirFechados: z
    .union([z.literal("1"), z.literal("0"), z.boolean()])
    .transform((v) => v === true || v === "1")
    .default(false),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export type StatusLead = string;
export type TipoInteracao = z.infer<typeof tipoInteracaoEnum>;
