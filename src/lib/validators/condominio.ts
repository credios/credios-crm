import { z } from "zod";

import { ASSEMBLEIA_STATUS } from "@/lib/condominio/constants";
import { isValidCnpj, isValidCpf, limparDocumento } from "@/lib/formatters/cpf-cnpj";

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v == null || v === "" ? null : v));

const inteiro = z.coerce.number().int().nonnegative().nullish();
const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use formato YYYY-MM-DD")
  .nullish()
  .or(z.literal("").transform(() => null));

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/**
 * Dados do condomínio (camelCase — UI e POST/PATCH /api/leads). Tudo opcional:
 * o lead nasce com o que o parceiro/consultor tiver e é completado depois.
 * CNPJ e CPF do síndico, quando informados, são validados e saem só dígitos.
 */
export const condominioSchema = z.object({
  cnpj: z
    .string()
    .nullish()
    .refine((v) => !limparDocumento(v) || isValidCnpj(v), "CNPJ inválido")
    .transform((v) => limparDocumento(v) || null),
  cep: texto(20),
  logradouro: texto(200),
  numero: texto(20),
  complemento: texto(120),
  bairro: texto(120),
  sindicoNome: texto(200),
  sindicoCpf: z
    .string()
    .nullish()
    .refine((v) => !soDigitos(v) || isValidCpf(v), "CPF do síndico inválido")
    .transform((v) => soDigitos(v) || null),
  sindicoProfissional: z.boolean().nullish(),
  sindicoMandatoFim: dataIso,
  administradora: texto(200),
  numUnidades: inteiro,
  arrecadacaoMensalCentavos: inteiro,
  inadimplenciaBps: z.coerce.number().int().min(0).max(10_000).nullish(),
  fundoReservaCentavos: inteiro,
  finalidadeDetalhes: texto(2000),
  prazoDesejadoMeses: z.coerce.number().int().positive().max(360).nullish(),
  obraOrcada: z.boolean().nullish(),
  assembleiaStatus: z.enum(ASSEMBLEIA_STATUS).nullish(),
  assembleiaData: dataIso,
});
export type CondominioInput = z.infer<typeof condominioSchema>;

/** Colunas de `lead_condominio` que o cliente pode escrever. */
export const CONDOMINIO_CAMPOS = Object.keys(
  condominioSchema.shape,
) as (keyof CondominioInput)[];

/**
 * Só as chaves que vieram no corpo bruto — o parse devolve `null` também pra
 * campo ausente, e num PATCH parcial isso apagaria o que não foi enviado
 * (mesmo booby trap documentado em PATCH /api/leads/[id]).
 */
export function condominioEnviado(
  bruto: unknown,
  validado: CondominioInput,
): Partial<CondominioInput> {
  const raw =
    bruto && typeof bruto === "object" && !Array.isArray(bruto)
      ? (bruto as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    CONDOMINIO_CAMPOS.filter((k) => k in raw).map((k) => [k, validado[k] ?? null]),
  ) as Partial<CondominioInput>;
}

/**
 * Mesmo conteúdo em snake_case, como chega no webhook (site / portal de
 * parceiros). Valores monetários em REAIS e inadimplência em %, convertidos
 * pelo webhook.
 */
export const condominioWebhookSchema = z
  .object({
    cnpj: z.string().optional(),
    cep: z.string().optional(),
    logradouro: z.string().optional(),
    numero: z.string().optional(),
    complemento: z.string().optional(),
    bairro: z.string().optional(),
    sindico_nome: z.string().optional(),
    sindico_cpf: z.string().optional(),
    sindico_profissional: z.coerce.boolean().optional(),
    sindico_mandato_fim: z.string().optional(),
    administradora: z.string().optional(),
    num_unidades: z.coerce.number().optional(),
    arrecadacao_mensal: z.coerce.number().nonnegative().optional(),
    inadimplencia_pct: z.coerce.number().min(0).max(100).optional(),
    fundo_reserva: z.coerce.number().nonnegative().optional(),
    finalidade_detalhes: z.string().optional(),
    prazo_desejado_meses: z.coerce.number().optional(),
    obra_orcada: z.coerce.boolean().optional(),
    assembleia_status: z.string().optional(),
    assembleia_data: z.string().optional(),
  })
  .passthrough();
export type CondominioWebhook = z.infer<typeof condominioWebhookSchema>;

const reais = (v: number | undefined) => (v == null ? null : Math.round(v * 100));

/**
 * Webhook → formato canônico. Tolerante: documento/data/status inválidos viram
 * null em vez de derrubar o lead (o payload bruto fica em `leads.raw_payload`).
 */
export function condominioDoWebhook(w: CondominioWebhook): CondominioInput {
  const candidato = {
    cnpj: isValidCnpj(w.cnpj) ? w.cnpj : null,
    cep: w.cep,
    logradouro: w.logradouro,
    numero: w.numero,
    complemento: w.complemento,
    bairro: w.bairro,
    sindicoNome: w.sindico_nome,
    sindicoCpf: isValidCpf(w.sindico_cpf) ? w.sindico_cpf : null,
    sindicoProfissional: w.sindico_profissional ?? null,
    sindicoMandatoFim: /^\d{4}-\d{2}-\d{2}$/.test(w.sindico_mandato_fim ?? "")
      ? w.sindico_mandato_fim
      : null,
    administradora: w.administradora,
    numUnidades: w.num_unidades != null ? Math.round(w.num_unidades) : null,
    arrecadacaoMensalCentavos: reais(w.arrecadacao_mensal),
    inadimplenciaBps:
      w.inadimplencia_pct != null ? Math.round(w.inadimplencia_pct * 100) : null,
    fundoReservaCentavos: reais(w.fundo_reserva),
    finalidadeDetalhes: w.finalidade_detalhes,
    prazoDesejadoMeses:
      w.prazo_desejado_meses != null && w.prazo_desejado_meses > 0
        ? Math.round(w.prazo_desejado_meses)
        : null,
    obraOrcada: w.obra_orcada ?? null,
    assembleiaStatus: (ASSEMBLEIA_STATUS as readonly string[]).includes(
      w.assembleia_status ?? "",
    )
      ? w.assembleia_status
      : null,
    assembleiaData: /^\d{4}-\d{2}-\d{2}$/.test(w.assembleia_data ?? "")
      ? w.assembleia_data
      : null,
  };
  const r = condominioSchema.safeParse(candidato);
  return r.success ? r.data : condominioSchema.parse({});
}
