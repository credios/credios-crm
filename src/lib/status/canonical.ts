/**
 * Status do lead — keys "sistema" referenciadas direto pelo código.
 *
 * Após migration 0003 o `leads.status` é text livre, mas estes 10 keys têm
 * tratamento especial em vários pontos do app:
 *
 *  - 'fechado' → modal de fechamento (banco/valor/comissão), reabertura
 *    admin-only, exibido como "operação concluída"
 *  - 'desqualificado'/'perdido' → modal de motivo
 *  - 'documentacao_enviada'/'em_negociacao' → modal de seleção de bancos
 *  - 'novo' → SLA primeiro contato 30min em horário comercial
 *  - terminais ('fechado'/'perdido'/'sem_resposta'/'desqualificado') → não
 *    geram tarefa diária, não entram em "pipeline ativo"
 *
 * Custom statuses criadas pelo admin não disparam nenhum desses caminhos —
 * são tratadas como transição "neutra".
 */
export const SYSTEM_STATUS_KEYS = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "fechado",
  "perdido",
  "sem_resposta",
  "desqualificado",
] as const;

export type SystemStatusKey = (typeof SYSTEM_STATUS_KEYS)[number];

const SYSTEM_KEY_SET = new Set<string>(SYSTEM_STATUS_KEYS);

/** True se a key é uma das 10 originais. */
export function isSystemStatus(key: string): key is SystemStatusKey {
  return SYSTEM_KEY_SET.has(key);
}

/**
 * Statuses terminais sistema. SLA esfriando/criticamente parado e tarefas
 * diárias não se aplicam — lead já saiu do funil ativo.
 */
export const SYSTEM_TERMINAL_KEYS = new Set<string>([
  "fechado",
  "perdido",
  "sem_resposta",
  "desqualificado",
]);

export function isSystemTerminal(key: string): boolean {
  return SYSTEM_TERMINAL_KEYS.has(key);
}

/** Labels default — sobrescritos pelos labels do `status_lead_config` em runtime. */
export const SYSTEM_STATUS_LABEL: Record<string, string> = {
  novo: "Novo",
  conversa_inicial: "Conversa inicial",
  aguardando_resposta: "Aguardando resposta",
  aguardando_documentacao: "Aguardando documentação",
  documentacao_enviada: "Documentação enviada",
  em_negociacao: "Em negociação",
  fechado: "Fechado",
  perdido: "Perdido",
  sem_resposta: "Sem resposta",
  desqualificado: "Desqualificado",
};
