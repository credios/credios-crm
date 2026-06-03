// ============================================================================
// Classificação dos tipos de interação (enum `tipo_interacao`) por natureza.
// ============================================================================
// Fonte ÚNICA de verdade usada pela timeline (UI), pela rota de criação de
// interação e pelas queries de placar — pra que não divirjam.
//
// Três naturezas:
//  1. Contato com o cliente — ligação, WhatsApp, email, reunião, contato
//     genérico, documento recebido. Conta como contato real: atualiza
//     `ultimo_contato`, resolve SLA de 1º contato, conta no placar "contatado
//     hoje" e alimenta o semáforo de cadência das negociações.
//  2. Acontecimento da operação — trabalho de bastidor (banco, vistoria,
//     análise de crédito). Registrado pelo consultor na timeline, mas NÃO é
//     contato com o cliente: não toca `ultimo_contato`, não resolve SLA, não
//     conta no placar.
//  3. Evento de sistema — gerado automaticamente (mudança de status/atribuição,
//     eventos diversos). Renderizado em estilo sutil.

/**
 * Acontecimentos da operação. Manuais (autor preenchido), mas não contam como
 * contato com o cliente. Ver decisão em CLAUDE.md / pedido do owner.
 */
export const ACONTECIMENTO_OPERACAO_TIPOS = [
  "contato_banco",
  "analise_credito_solicitada",
  "vistoria_realizada",
] as const;

/** Eventos gerados pelo sistema, sem ação direta do consultor. */
export const SISTEMA_TIPOS = [
  "mudanca_status",
  "mudanca_atribuicao",
  "evento_sistema",
] as const;

const ACONTECIMENTO_SET: ReadonlySet<string> = new Set(
  ACONTECIMENTO_OPERACAO_TIPOS,
);
const SISTEMA_SET: ReadonlySet<string> = new Set(SISTEMA_TIPOS);

/** Tipos que NÃO contam como contato com o cliente (acontecimentos + sistema).
 *  Usado para excluir esses tipos das métricas de contato. `as const` mantém os
 *  literais (e não `string[]`) pra casar com o enum nas queries drizzle. */
export const NAO_CONTATO_TIPOS = [
  ...ACONTECIMENTO_OPERACAO_TIPOS,
  ...SISTEMA_TIPOS,
] as const;

export function isAcontecimentoOperacao(tipo: string): boolean {
  return ACONTECIMENTO_SET.has(tipo);
}

export function isEventoSistema(tipo: string): boolean {
  return SISTEMA_SET.has(tipo);
}

/**
 * Conta como contato real com o cliente? Tudo que não é acontecimento da
 * operação nem evento de sistema (ligação, WhatsApp, email, reunião, contato
 * genérico, documento recebido).
 */
export function isContatoComCliente(tipo: string): boolean {
  return !ACONTECIMENTO_SET.has(tipo) && !SISTEMA_SET.has(tipo);
}
