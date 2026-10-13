import { z } from "zod";

import { COMISSAO_STATUS } from "@/lib/parceiros/constants";

const centavos = z.number().int().nonnegative();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use formato YYYY-MM-DD");

/**
 * Comissão do parceiro por operação — caso a caso. O admin informa o VALOR
 * direto, ou BASE + PERCENTUAL (aí o valor é calculado). Informar os três só
 * vale se baterem: evita gravar um percentual que não explica o valor.
 */
export const criarComissaoSchema = z
  .object({
    leadId: z.uuid().optional().nullable(),
    descricao: z.string().trim().max(300).optional().nullable(),
    baseCentavos: centavos.optional().nullable(),
    percentualBps: z.number().int().min(0).max(10_000).optional().nullable(),
    valorCentavos: centavos.optional().nullable(),
    observacao: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    const calculavel = v.baseCentavos != null && v.percentualBps != null;
    if (v.valorCentavos == null && !calculavel) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o valor da comissão, ou a base e o percentual.",
      });
      return;
    }
    if (v.valorCentavos != null && calculavel) {
      const esperado = calcularComissao(v.baseCentavos!, v.percentualBps!);
      if (Math.abs(esperado - v.valorCentavos) > 1) {
        ctx.addIssue({
          code: "custom",
          message: "Valor não confere com base × percentual.",
        });
      }
    }
    if (!v.leadId && !v.descricao) {
      ctx.addIssue({
        code: "custom",
        message: "Vincule a uma operação ou descreva a comissão.",
      });
    }
  });
export type CriarComissaoInput = z.infer<typeof criarComissaoSchema>;

export const atualizarComissaoSchema = z
  .object({
    status: z.enum(COMISSAO_STATUS).optional(),
    pagoEm: dataIso.optional().nullable(),
    observacao: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => v.status !== "paga" || !!v.pagoEm, {
    message: "Informe a data do pagamento.",
  });
export type AtualizarComissaoInput = z.infer<typeof atualizarComissaoSchema>;

/** base (centavos) × percentual (pontos-base) → centavos, arredondado. */
export function calcularComissao(baseCentavos: number, percentualBps: number): number {
  return Math.round((baseCentavos * percentualBps) / 10_000);
}
