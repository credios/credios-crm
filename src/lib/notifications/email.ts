import { Resend } from "resend";

import type { InferSelectModel } from "drizzle-orm";
import type { leads as leadsTable } from "../../../db/schema";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
const replyTo = process.env.EMAIL_REPLY_TO;

const resend = apiKey ? new Resend(apiKey) : null;

type Lead = InferSelectModel<typeof leadsTable>;

function formatBrl(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Envia alerta para os emails dados quando chega lead fora do horário
 * comercial. Falha silenciosamente (apenas loga) — webhook não pode quebrar
 * por causa de email.
 */
export async function sendNewLeadAlert(
  lead: Lead,
  recipients: string[],
): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  if (recipients.length === 0) return { ok: false, reason: "nenhum destinatário" };

  const valor = formatBrl(lead.valorCreditoCentavos);
  const subject = `🚨 Novo lead fora do horário: ${lead.nome} — ${valor}`;
  const text = [
    `Novo lead recebido em ${lead.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (BRT).`,
    "",
    `Nome:           ${lead.nome}`,
    `WhatsApp:       ${lead.whatsapp ?? "—"}`,
    `Email:          ${lead.email ?? "—"}`,
    `Cidade/UF:      ${[lead.cidade, lead.estado].filter(Boolean).join("/") || "—"}`,
    `Valor buscado:  ${valor}`,
    `Valor imóvel:   ${formatBrl(lead.valorImovelCentavos)}`,
    `Origem:         ${lead.origem ?? "—"}`,
    `Campanha:       ${lead.utmCampaign ?? "—"}`,
    "",
    `Ver no CRM: ${appUrl(`/leads/${lead.id}`)}`,
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from,
      to: recipients,
      replyTo,
      subject,
      text,
    });
    if (result.error) {
      console.error("[email] resend error:", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}
