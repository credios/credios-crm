import type { CreateLeadInput } from "@/lib/validators/lead";
import {
  reaisParaCentavos,
  type WebhookLeadPayload,
} from "@/lib/validators/webhook";

import type { RoutingContext } from "./types";

export function contextFromWebhook(p: WebhookLeadPayload): RoutingContext {
  return {
    valorCreditoCentavos: reaisParaCentavos(p.valor_credito),
    valorImovelCentavos: reaisParaCentavos(p.valor_imovel),
    estado: p.estado ? p.estado.toUpperCase() : null,
    origem: p.origem || null,
    tipoImovel: p.tipo_imovel || null,
  };
}

export function contextFromCreateLead(p: CreateLeadInput): RoutingContext {
  return {
    valorCreditoCentavos: p.valorCreditoCentavos ?? null,
    valorImovelCentavos: p.valorImovelCentavos ?? null,
    estado: p.estado ? p.estado.toUpperCase() : null,
    origem: p.origem ?? null,
    tipoImovel: p.tipoImovel ?? null,
  };
}
