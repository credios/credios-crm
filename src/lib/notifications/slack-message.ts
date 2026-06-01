import type { InferSelectModel } from "drizzle-orm";

import type { leads as leadsTable } from "../../../db/schema";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { appUrl } from "@/lib/notifications/email-layout";

type Lead = InferSelectModel<typeof leadsTable>;

/**
 * Monta a mensagem Slack (Block Kit) de "lead atribuído ao consultor".
 * Função PURA (sem rede, sem env) — testável e reutilizável. O envio fica
 * em slack.ts (server-only).
 *
 * Retorna `text` (fallback usado na notificação push/preview do Slack) e
 * `blocks` (layout rico exibido na conversa).
 */
export function buildLeadAssignedSlackMessage(
  lead: Lead,
  consultorNome: string,
): { text: string; blocks: unknown[] } {
  const valor =
    lead.valorCreditoCentavos != null
      ? formatBrlFromCents(lead.valorCreditoCentavos)
      : "—";
  const local = [lead.cidade, lead.estado].filter(Boolean).join(" / ") || "—";
  const status = STATUS_LEAD_LABEL[lead.status] ?? lead.status;
  const url = appUrl(`/leads/${lead.id}`);
  const primeiroNome = consultorNome.trim().split(/\s+/)[0] || consultorNome;

  const text = `Novo lead pra você: ${lead.nome} — ${valor} (${local})`;

  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:wave: *${primeiroNome}, você recebeu um novo lead!*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Nome*\n${lead.nome}` },
        { type: "mrkdwn", text: `*Valor buscado*\n${valor}` },
        { type: "mrkdwn", text: `*Cidade*\n${local}` },
        { type: "mrkdwn", text: `*Status*\n${status}` },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir lead no CRM", emoji: true },
          url,
          style: "primary",
        },
      ],
    },
  ];

  return { text, blocks };
}
