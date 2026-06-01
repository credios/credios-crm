/**
 * Valor TOTAL de crédito buscado pelo cliente.
 *
 * Contexto de negócio: quando o imóvel está financiado, a nova operação
 * precisa cobrir o saldo devedor (pra quitar o financiamento atual) MAIS o
 * valor que o cliente quer receber em mãos. A maioria dos clientes informa
 * no simulador só o "valor de força" (o que quer receber), o que subdimensiona
 * o tamanho real do crédito. Este total mostra a operação de verdade:
 *
 *   total = valor buscado (valorCreditoCentavos) + saldo devedor (saldoDevedorCentavos)
 *
 * É um valor DERIVADO — não é persistido no banco. Calculado sempre a partir
 * dos dois campos-fonte, então nunca fica desatualizado.
 */

/** True quando há saldo devedor relevante (imóvel financiado). */
export function temSaldoDevedor(
  saldoDevedorCentavos: number | null | undefined,
): boolean {
  return (saldoDevedorCentavos ?? 0) > 0;
}

/**
 * Soma do valor buscado com o saldo devedor (em centavos).
 * Retorna `null` quando não há valor buscado informado (nada a somar).
 */
export function creditoTotalBuscadoCentavos(
  valorCreditoCentavos: number | null | undefined,
  saldoDevedorCentavos: number | null | undefined,
): number | null {
  if (valorCreditoCentavos == null) return null;
  return valorCreditoCentavos + (saldoDevedorCentavos ?? 0);
}
