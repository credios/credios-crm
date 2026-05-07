import { z } from "zod";

import { isValidCpf } from "@/lib/formatters/cpf-cnpj";

// ═══════════════════════════════════════════════════════════
// Schema do simulador simplificado — espelhado do site
// (credios-website-v2/src/lib/validators.ts → simpleSimulatorSchema).
//
// Mantemos os mesmos limites e o mesmo motor de cálculo pra que a
// simulação saia idêntica entre o CRM (gerada pelo consultor) e o
// site interno (rota /interno/simulador-simplificado).
// ═══════════════════════════════════════════════════════════

/** LTV máximo aceito pelos bancos parceiros — 60% do valor do imóvel. */
export const LTV_MAX = 0.6;

export const simpleSimulatorSchema = z
  .object({
    clientName: z.string().min(3, "Nome é obrigatório"),
    clientCPF: z
      .string()
      .default("")
      .refine(
        (val) => val.trim() === "" || isValidCpf(val),
        "CPF inválido",
      ),
    creditAmount: z.number().positive("Valor do crédito deve ser positivo"),
    propertyValue: z.number().positive("Valor do imóvel deve ser positivo"),
    interestRate: z.number().positive("Taxa deve ser positiva"),
    amortizationType: z.enum(["price", "sac"], {
      message: "Selecione SAC ou PRICE",
    }),
    installments: z
      .number()
      .int("Prazo deve ser inteiro")
      .positive("Prazo deve ser positivo"),
    indexation: z.enum(["pre", "pos"], {
      message: "Selecione Pré-fixado ou Pós-fixado",
    }),
  })
  .refine(
    ({ creditAmount, propertyValue }) =>
      creditAmount <= propertyValue * LTV_MAX,
    {
      message: `Valor do crédito excede o LTV máximo (${LTV_MAX * 100}% do imóvel)`,
      path: ["creditAmount"],
    },
  );

export type SimpleSimulatorFormValues = z.infer<typeof simpleSimulatorSchema>;
