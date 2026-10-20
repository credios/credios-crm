import { z } from "zod";

import { FINALIDADES_CONDOMINIO } from "@/lib/condominio/constants";
import { isValidCnpj, limparDocumento } from "@/lib/formatters/cpf-cnpj";

// Simulação de crédito para condomínio gerada pelo parceiro no portal.
// Valor em CENTAVOS. A faixa de valor permitida é da config do admin e é
// conferida no serviço (src/lib/portal-parceiro/simulacoes.ts).

export const simulacaoCondominioSchema = z.object({
  condominioNome: z
    .string()
    .trim()
    .min(3, "Informe o nome do condomínio.")
    .max(200, "Nome muito longo."),
  cnpj: z
    .string()
    .refine((v) => isValidCnpj(v), "CNPJ inválido.")
    .transform(limparDocumento),
  valorCreditoCentavos: z
    .number()
    .int()
    .positive("Informe o valor do crédito."),
  numUnidades: z
    .number()
    .int("Informe um número inteiro de unidades.")
    .positive("Informe um número de unidades maior que zero.")
    .max(100_000, "Número de unidades muito alto.")
    .nullish()
    .transform((v) => v ?? null),
  finalidade: z
    .enum(FINALIDADES_CONDOMINIO, { message: "Finalidade inválida." })
    .nullish()
    .transform((v) => v ?? null),
});
export type SimulacaoCondominioInputPortal = z.infer<typeof simulacaoCondominioSchema>;
