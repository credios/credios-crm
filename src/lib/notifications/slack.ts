import "server-only";

import type { InferSelectModel } from "drizzle-orm";

import type { leads as leadsTable } from "../../../db/schema";
import { buildLeadAssignedSlackMessage } from "@/lib/notifications/slack-message";

type Lead = InferSelectModel<typeof leadsTable>;
type SlackResult = { ok: boolean; reason?: string };

const SLACK_API = "https://slack.com/api";
const token = process.env.SLACK_BOT_TOKEN;

/** Busca o Slack user ID a partir do e-mail (precisa casar com o e-mail do Slack). */
async function lookupSlackUserId(email: string): Promise<string | null> {
  const res = await fetch(
    `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as { ok: boolean; user?: { id: string } };
  return data.ok && data.user ? data.user.id : null;
}

/**
 * Avisa o consultor no Slack (DM) que ele recebeu um lead atribuído.
 *
 * No-op silencioso se `SLACK_BOT_TOKEN` não estiver configurado — espelha o
 * comportamento do e-mail (gated por `RESEND_API_KEY`). Nunca lança: o envio
 * roda em `after()` (pós-resposta), então uma falha aqui não afeta a request.
 *
 * Requer (no Slack App): scopes `chat:write` e `users:read.email`. O e-mail
 * do consultor no CRM precisa bater com o e-mail da conta Slack dele.
 */
export async function sendLeadAssignedSlack(
  lead: Lead,
  consultorEmail: string,
  consultorNome: string,
): Promise<SlackResult> {
  if (!token) return { ok: false, reason: "SLACK_BOT_TOKEN ausente" };
  if (!consultorEmail) return { ok: false, reason: "e-mail do consultor vazio" };

  try {
    const userId = await lookupSlackUserId(consultorEmail);
    if (!userId) {
      return {
        ok: false,
        reason: `Slack: usuário não encontrado para ${consultorEmail}`,
      };
    }

    const { text, blocks } = buildLeadAssignedSlackMessage(lead, consultorNome);
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel: userId, text, blocks }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      console.error("[slack-assigned] postMessage error:", data.error);
      return { ok: false, reason: data.error ?? "erro Slack" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[slack-assigned] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}
