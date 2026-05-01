import type { WebhookLeadPayload } from "@/lib/validators/webhook";

export type RoutingResult = {
  consultorId: string | null;
  /** Identificador descritivo para audit (ex: "round_robin:regra-x" ou "pool"). */
  appliedRule: string;
};

/**
 * MVP placeholder: todo lead recém-recebido vai para o pool não-atribuído.
 * Fase 4 (CLAUDE.md §6.4): implementar engine baseado em regras_roteamento
 * com prioridade, condições JSONB e ações (atribuir_usuario, round_robin_grupo,
 * pool_nao_atribuido).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function routeNewLead(payload: WebhookLeadPayload): Promise<RoutingResult> {
  return { consultorId: null, appliedRule: "pool_nao_atribuido_default" };
}
