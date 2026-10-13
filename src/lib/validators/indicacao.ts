import { z } from "zod";

import { FINALIDADES_CONDOMINIO } from "@/lib/condominio/constants";
import { isValidCnpj, isValidCpfOrCnpj } from "@/lib/formatters/cpf-cnpj";

// Indicação de cliente feita pelo parceiro no portal. Valores em CENTAVOS.
// As regras de política (pisos, LTV, renda) ficam em prequal.ts — aqui só
// formato e obrigatoriedade por produto.

const centavos = z.number().int().nonnegative();
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v == null || v === "" ? null : v));
const digitos = (v: string) => v.replace(/\D/g, "");

const comum = {
  whatsapp: z
    .string()
    .trim()
    .refine((v) => digitos(v).length >= 10, "Informe o WhatsApp com DDD."),
  email: z
    .string()
    .trim()
    .nullish()
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido.")
    .transform((v) => v || null),
  cidade: opt(120),
  estado: z
    .string()
    .trim()
    .nullish()
    .refine((v) => !v || /^[A-Za-z]{2}$/.test(v), "UF inválida.")
    .transform((v) => (v ? v.toUpperCase() : null)),
  valorCreditoCentavos: centavos.refine((v) => v > 0, "Informe o valor de crédito desejado."),
  observacoes: opt(2000),
  // LGPD: o parceiro declara que tem autorização do cliente pra compartilhar.
  consentimento: z.literal(true, {
    message: "Confirme que você tem autorização do cliente para compartilhar os dados.",
  }),
};

export const indicacaoCgiSchema = z.object({
  produto: z.literal("CGI"),
  nome: z.string().trim().min(3, "Informe o nome completo do cliente.").max(200),
  documento: z
    .string()
    .refine((v) => isValidCpfOrCnpj(v), "CPF ou CNPJ inválido.")
    .transform(digitos),
  tipoImovel: z.string().trim().min(1, "Selecione o tipo do imóvel."),
  valorImovelCentavos: centavos.refine((v) => v > 0, "Informe o valor aproximado do imóvel."),
  rendaTitularCentavos: centavos.refine((v) => v > 0, "Informe a renda mensal do titular."),
  rendaConjugeCentavos: centavos.default(0),
  // 0 = imóvel quitado.
  saldoDevedorCentavos: centavos.default(0),
  ...comum,
});

export const indicacaoCondominioSchema = z.object({
  produto: z.literal("CONDOMINIO"),
  nome: z.string().trim().min(3, "Informe o nome do condomínio.").max(200),
  documento: z
    .string()
    .refine((v) => isValidCnpj(v), "CNPJ inválido.")
    .transform(digitos),
  sindicoNome: z.string().trim().min(3, "Informe o nome do síndico.").max(200),
  finalidade: z.enum(FINALIDADES_CONDOMINIO, { message: "Selecione a finalidade." }),
  numUnidades: z.number().int().positive().max(100_000).nullish(),
  administradora: opt(200),
  ...comum,
});

export const indicacaoSchema = z.discriminatedUnion("produto", [
  indicacaoCgiSchema,
  indicacaoCondominioSchema,
]);
export type IndicacaoInput = z.infer<typeof indicacaoSchema>;
