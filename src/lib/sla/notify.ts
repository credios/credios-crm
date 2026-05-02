import "server-only";

import { and, eq } from "drizzle-orm";
import { Resend } from "resend";

import { users as usersTable } from "../../../db/schema";
import { db } from "@/lib/db";
import {
  appUrl,
  escape,
  kpiRow,
  pill,
  renderEmailLayout,
} from "@/lib/notifications/email-layout";

import type { NewSlaAlert } from "./check";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
const replyTo = process.env.EMAIL_REPLY_TO;

const resend = apiKey ? new Resend(apiKey) : null;

function minutesAgoLabel(d: Date | null): string {
  if (!d) return "—";
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  if (m < 60) return `há ${m}min`;
  const h = Math.round(m / 60);
  return `há ${h}h`;
}

/**
 * Envia 1 email pra todos os admins com a lista de novos alertas SLA.
 * Falha silenciosamente — cron não pode quebrar por causa de email.
 */
export async function sendSlaAlertEmail(
  novos: NewSlaAlert[],
): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  if (novos.length === 0) return { ok: true };

  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.perfil, "admin"), eq(usersTable.ativo, true)));
  const recipients = admins.map((a) => a.email).filter(Boolean);
  if (recipients.length === 0) return { ok: false, reason: "nenhum admin ativo" };

  const html = renderSlaAlertEmail({ novos });
  const subject = `${novos.length} lead${novos.length === 1 ? "" : "s"} sem 1º contato (>30min)`;

  try {
    const result = await resend.emails.send({
      from,
      to: recipients,
      replyTo,
      subject,
      html,
    });
    if (result.error) {
      console.error("[sla email] resend error:", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[sla email] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}

export function renderSlaAlertEmail(params: { novos: NewSlaAlert[] }): string {
  const { novos } = params;

  const cards = novos
    .map(
      (a) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px"><tr><td style="background:#fff;border:1px solid #e1ddcf;border-radius:10px;padding:14px 16px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="vertical-align:top">
            <a href="${appUrl(`/leads/${a.leadId}`)}" style="text-decoration:none;color:#141e30;font-weight:700;font-family:'Plus Jakarta Sans',Inter,Arial,sans-serif;font-size:15px">${escape(a.leadNome)}</a>
            <div style="margin-top:6px;font-family:Inter,Arial,sans-serif;font-size:13px;color:#6b6f7e">Atribuído ${escape(minutesAgoLabel(a.atribuidoEm))}</div>
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:8px">${pill(minutesAgoLabel(a.atribuidoEm), "danger")}</td>
        </tr></table>
      </td></tr></table>`,
    )
    .join("");

  const horario = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  return renderEmailLayout({
    preheader: `${novos.length} lead${novos.length === 1 ? "" : "s"} aguardando 1º contato há mais de 30min`,
    eyebrow: "Alerta SLA",
    eyebrowTone: "danger",
    title: `${novos.length} lead${novos.length === 1 ? "" : "s"} sem primeiro contato`,
    intro: `Detectados às ${horario} (BRT). Todos passaram do SLA de 30min desde a atribuição. Cobrar consultor ou reatribuir.`,
    contentHtml: `${kpiRow([
      { label: "Pendentes", value: String(novos.length), tone: "danger" },
    ])}${cards}`,
    ctas: [
      { href: appUrl("/leads?status=novo"), label: "Ver leads novos" },
    ],
  });
}
