import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { Resend } from "resend";

import { users as usersTable } from "../../../db/schema";
import { db } from "@/lib/db";

import type { NewSlaAlert } from "./check";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
const replyTo = process.env.EMAIL_REPLY_TO;

const resend = apiKey ? new Resend(apiKey) : null;

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function minutesAgo(d: Date | null): string {
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
export async function sendSlaAlertEmail(novos: NewSlaAlert[]): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  if (novos.length === 0) return { ok: true };

  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.perfil, "admin"), eq(usersTable.ativo, true)));
  const recipients = admins.map((a) => a.email).filter(Boolean);
  if (recipients.length === 0) return { ok: false, reason: "nenhum admin ativo" };

  void sql; // silence

  const subject = `🚨 ${novos.length} lead${novos.length > 1 ? "s" : ""} sem primeiro contato (>30min)`;
  const lines = [
    `Alertas de SLA disparados em ${new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    })} (BRT).`,
    "",
    ...novos.map(
      (a) =>
        `• ${a.leadNome} (atribuído ${minutesAgo(a.atribuidoEm)}) → ${appUrl(`/leads/${a.leadId}`)}`,
    ),
    "",
    `Ver todos: ${appUrl("/leads?status=novo")}`,
  ];

  try {
    const result = await resend.emails.send({
      from,
      to: recipients,
      replyTo,
      subject,
      text: lines.join("\n"),
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
