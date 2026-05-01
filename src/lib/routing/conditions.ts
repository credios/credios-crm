import { dentroHorarioComercial } from "@/lib/horario-comercial";

import type { RoutingContext, RuleCondicoes } from "./types";

/**
 * Avalia se TODAS as condições da regra batem com o contexto do lead.
 * Lista vazia = bate sempre (regra fallback). Valor ausente no lead com
 * condição min/max definida = NÃO bate (lead não tem como atender o critério).
 */
export function matchesConditions(
  ctx: RoutingContext,
  conds: RuleCondicoes,
): boolean {
  if (
    conds.valor_credito_min != null &&
    (ctx.valorCreditoCentavos == null ||
      ctx.valorCreditoCentavos < conds.valor_credito_min)
  ) {
    return false;
  }
  if (
    conds.valor_credito_max != null &&
    (ctx.valorCreditoCentavos == null ||
      ctx.valorCreditoCentavos > conds.valor_credito_max)
  ) {
    return false;
  }
  if (
    conds.valor_imovel_min != null &&
    (ctx.valorImovelCentavos == null ||
      ctx.valorImovelCentavos < conds.valor_imovel_min)
  ) {
    return false;
  }
  if (
    conds.valor_imovel_max != null &&
    (ctx.valorImovelCentavos == null ||
      ctx.valorImovelCentavos > conds.valor_imovel_max)
  ) {
    return false;
  }
  if (conds.estado_in?.length) {
    if (!ctx.estado || !conds.estado_in.includes(ctx.estado)) return false;
  }
  if (conds.origem_in?.length) {
    if (!ctx.origem || !conds.origem_in.includes(ctx.origem)) return false;
  }
  if (conds.tipo_imovel_in?.length) {
    if (!ctx.tipoImovel || !conds.tipo_imovel_in.includes(ctx.tipoImovel))
      return false;
  }
  if (conds.horario_comercial != null) {
    const dentro = ctx.horarioComercial ?? dentroHorarioComercial();
    if (conds.horario_comercial !== dentro) return false;
  }
  return true;
}
