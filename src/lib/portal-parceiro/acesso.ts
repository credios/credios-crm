import "server-only";

import { redirect } from "next/navigation";

import { precisaAssinarContrato } from "./contrato/servico";
import { exigirParceiro, type ParceiroSessao } from "./sessao";

export const ROTA_CONTRATO = "/portal-parceiro/contrato";

/**
 * Sessão + contrato em dia. Usado por toda página que mostra indicações ou
 * comissões: sem contrato assinado (ou com contrato que não cobre um produto
 * habilitado), o parceiro é levado pra assinatura.
 */
export async function exigirParceiroComContrato(): Promise<ParceiroSessao> {
  const sessao = await exigirParceiro();
  if (await precisaAssinarContrato(sessao.parceiroId, sessao.produtosHabilitados)) {
    redirect(ROTA_CONTRATO);
  }
  return sessao;
}
