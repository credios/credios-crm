// Notifica o Portal de Parceiros (parceiros.credios.com.br) quando um lead
// INDICADO POR PARCEIRO muda de status. Fire-and-forget: falha vira
// console.error, nunca exceção — a mudança de status do CRM não depende do
// portal.
//
// Vínculo: o portal guarda o id do lead DO CRM (crmLeadId). Basta enviar
// lead.id — o portal resolve o resto. Só notificamos leads cujo source é
// "Portal de Parceiros" (qualquer outro lead seria 404 no portal, ruído).
//
// Envs necessárias (sem elas, no-op silencioso):
//   PORTAL_WEBHOOK_URL    = https://parceiros.credios.com.br/api/webhooks/crm
//   PORTAL_WEBHOOK_SECRET = mesmo valor configurado no portal

import crypto from "node:crypto";

import type { leads } from "../../../db/schema";

type LeadRow = typeof leads.$inferSelect;

const PORTAL_SOURCE = "Portal de Parceiros";
const TIMEOUT_MS = 10_000;

export async function notifyPartnerPortal(
  lead: LeadRow,
  novoStatus: string,
): Promise<void> {
  try {
    const url = process.env.PORTAL_WEBHOOK_URL;
    const secret = process.env.PORTAL_WEBHOOK_SECRET;
    if (!url || !secret) return; // integração não configurada — no-op

    // Só leads vindos do portal (source canônico ou mirror legado `origem`).
    if (lead.source !== PORTAL_SOURCE && lead.origem !== PORTAL_SOURCE) return;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-portal-secret": secret,
      },
      body: JSON.stringify({
        event: "lead.status_changed",
        crmLeadId: lead.id,
        status: novoStatus,
        valorLiberadoCentavos: lead.valorLiberadoCentavos ?? undefined,
        bancoAprovador: lead.bancoAprovador ?? undefined,
        dataFechamento: lead.dataFechamento ?? undefined, // "YYYY-MM-DD"
        eventId: crypto.randomUUID(), // dedupe no portal
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(
        `[portal-webhook] portal respondeu ${res.status} para lead ${lead.id}`,
      );
    }
  } catch (err) {
    console.error("[portal-webhook] falha ao notificar portal:", err);
  }
}
