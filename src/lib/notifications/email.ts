import "server-only";

import { Resend } from "resend";

import type { InferSelectModel } from "drizzle-orm";
import type { leads as leadsTable } from "../../../db/schema";
import {
  appUrl,
  escape,
  kpiRow,
  renderEmailLayout,
} from "@/lib/notifications/email-layout";

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
  if (recipients.length === 0)
    return { ok: false, reason: "nenhum destinatário" };

  const valor = formatBrl(lead.valorCreditoCentavos);
  const subject = `Novo lead fora do horário: ${lead.nome} — ${valor}`;
  const html = renderNewLeadAlertEmail({ lead });

  try {
    const result = await resend.emails.send({
      from,
      to: recipients,
      replyTo,
      subject,
      html,
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

export function renderNewLeadAlertEmail(params: { lead: Lead }): string {
  const { lead } = params;
  const horario = lead.createdAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  // Linha de detalhes em definition list (cabe em mobile e desktop).
  const detail = (label: string, value: string) =>
    `<tr>
      <td style="padding:8px 0;font-family:Inter,Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6b6f7e;font-weight:700;width:140px;vertical-align:top">${escape(label)}</td>
      <td style="padding:8px 0;font-family:Inter,Arial,sans-serif;font-size:14px;color:#141e30;vertical-align:top">${escape(value || "—")}</td>
    </tr>`;

  const cidadeUf = [lead.cidade, lead.estado].filter(Boolean).join(" / ") || "—";
  const wpHref = lead.whatsapp
    ? `https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`
    : null;

  const detailsHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8f6f0;border:1px solid #e1ddcf;border-radius:10px;padding:8px 16px">
    <tbody>
      ${detail("WhatsApp", lead.whatsapp ?? "—")}
      ${detail("Email", lead.email ?? "—")}
      ${detail("Cidade / UF", cidadeUf)}
      ${detail("Valor imóvel", formatBrl(lead.valorImovelCentavos))}
      ${detail("Renda", formatBrl(lead.rendaMensalCentavos))}
      ${detail("Origem", lead.origem ?? "—")}
      ${detail("Campanha", lead.utmCampaign ?? "—")}
      ${detail("Recebido em", `${horario} (BRT)`)}
    </tbody>
  </table>`;

  const ctas: Array<{ href: string; label: string; tone?: "primary" | "secondary" }> = [
    { href: appUrl(`/leads/${lead.id}`), label: "Abrir lead no CRM" },
  ];
  if (wpHref) ctas.push({ href: wpHref, label: "Abrir WhatsApp", tone: "secondary" });

  return renderEmailLayout({
    preheader: `${lead.nome} — ${formatBrl(lead.valorCreditoCentavos)} buscado, ${cidadeUf}`,
    eyebrow: "Novo lead · fora do horário",
    eyebrowTone: "warning",
    title: lead.nome,
    intro:
      "Lead chegou agora pelo site. Como está fora do horário comercial, não foi atribuído automaticamente — atribua manualmente quando voltar a operar, ou avalie qualidade pra triagem.",
    contentHtml: `${kpiRow([
      {
        label: "Valor buscado",
        value: formatBrl(lead.valorCreditoCentavos),
        tone: "info",
      },
    ])}${detailsHtml}`,
    ctas,
  });
}
