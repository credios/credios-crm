import { z } from "zod";

import { MAX_PRAZOS_SIMULACAO_FUNDO } from "@/lib/simulador/fundo";

/** Corpo do POST /api/leads/[id]/simulacao-fundo. Valores em reais. */
export const simulacaoFundoSchema = z.object({
  valorCredito: z.number().positive("Informe o valor do crédito").max(1_000_000_000),
  prazos: z
    .array(
      z.object({
        meses: z.number().int().min(1, "Prazo mínimo de 1 mês").max(420, "Prazo máximo de 420 meses"),
        taxaAm: z.number().gt(0, "Informe a taxa").max(20, "Taxa acima de 20% a.m."),
      }),
    )
    .min(1, "Informe ao menos um prazo")
    .max(MAX_PRAZOS_SIMULACAO_FUNDO, `No máximo ${MAX_PRAZOS_SIMULACAO_FUNDO} prazos`)
    .refine(
      (ps) => new Set(ps.map((p) => `${p.meses}|${p.taxaAm}`)).size === ps.length,
      "Há prazos repetidos com a mesma taxa",
    ),
  iof: z.enum(["PF", "PJ", "nenhum"]),
});

export type SimulacaoFundoBody = z.infer<typeof simulacaoFundoSchema>;
