import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { Resend } from "resend";

import { users as usersTable } from "../../../db/schema";
import { formatBrlShort } from "@/lib/formatters/currency";
import { db } from "@/lib/db";

import {
  listTasksForUser,
  taskStatsByConsultor,
  yesterdayNewUnmovedLeadsByConsultor,
} from "./service";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
const replyTo = process.env.EMAIL_REPLY_TO;
const resend = apiKey ? new Resend(apiKey) : null;

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
  <html>
    <body style="margin:0;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#171717">
      <div style="max-width:720px;margin:0 auto;padding:28px 18px">
        <div style="background:#fff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden">
          <div style="padding:22px 24px;border-bottom:1px solid #eee">
            <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9b7a20;font-weight:700">CRM Credios</div>
            <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25">${title}</h1>
          </div>
          <div style="padding:22px 24px">${body}</div>
        </div>
      </div>
    </body>
  </html>`;
}

function pill(text: string, color: string): string {
  return `<span style="display:inline-block;border-radius:999px;padding:3px 8px;background:${color};font-size:12px;font-weight:700">${text}</span>`;
}

export async function sendDailyTaskEmails(dataReferencia: string): Promise<{
  ok: boolean;
  sentConsultores: number;
  sentAdmin: boolean;
  reason?: string;
}> {
  if (!resend) {
    return {
      ok: false,
      sentConsultores: 0,
      sentAdmin: false,
      reason: "RESEND_API_KEY ausente",
    };
  }

  const consultores = await db
    .select({ id: usersTable.id, nome: usersTable.nome, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.ativo, true), inArray(usersTable.perfil, ["admin", "gerente", "consultor"])));

  const unmoved = await yesterdayNewUnmovedLeadsByConsultor();
  type UnmovedRow = (typeof unmoved)[number];
  const unmovedByConsultor = new Map<string, UnmovedRow[]>();
  for (const row of unmoved) {
    const arr = unmovedByConsultor.get(row.consultor_id) ?? [];
    arr.push(row);
    unmovedByConsultor.set(row.consultor_id, arr);
  }

  let sentConsultores = 0;
  for (const c of consultores) {
    const tasks = await listTasksForUser({
      userId: c.id,
      perfil: "consultor",
      status: "todas",
      data: dataReferencia,
    });
    const atrasadas = await listTasksForUser({
      userId: c.id,
      perfil: "consultor",
      status: "atrasada",
    });
    if (tasks.length === 0 && atrasadas.length === 0) continue;

    const destaque = unmovedByConsultor.get(c.id) ?? [];
    const taskItems = [...atrasadas, ...tasks]
      .slice(0, 40)
      .map(
        (t) => `<li style="margin:0 0 12px">
          <a href="${appUrl(`/leads/${t.leadId}`)}" style="font-weight:700;color:#1455d9;text-decoration:none">${t.leadNome}</a>
          ${t.status === "atrasada" ? pill("Atrasada", "#fee2e2") : pill("Hoje", "#e0f2fe")}
          <div style="font-size:13px;color:#555;margin-top:3px">${t.titulo} · ${formatBrlShort(t.valorCreditoCentavos)}</div>
        </li>`,
      )
      .join("");

    const destaqueHtml =
      destaque.length > 0
        ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px">
            <b>Leads novos de ontem ainda em Novo</b>
            <ul style="margin:10px 0 0;padding-left:18px">${destaque
              .map(
                (l) =>
                  `<li><a href="${appUrl(`/leads/${l.lead_id}`)}" style="color:#1455d9">${l.lead_nome}</a> · ${formatBrlShort(Number(l.valor_credito_centavos ?? 0))}</li>`,
              )
              .join("")}</ul>
          </div>`
        : "";

    const html = shell(
      `Tarefas do dia · ${c.nome}`,
      `${destaqueHtml}
       <p style="margin-top:0;color:#444">Você tem <b>${tasks.length}</b> tarefas de hoje e <b>${atrasadas.length}</b> atrasadas.</p>
       <ul style="padding-left:18px;margin:16px 0">${taskItems || "<li>Sem tarefas pendentes.</li>"}</ul>
       <p style="margin:20px 0 0"><a href="${appUrl("/tarefas")}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;padding:10px 14px;font-weight:700">Abrir tarefas</a></p>`,
    );

    const result = await resend.emails.send({
      from,
      to: c.email,
      replyTo,
      subject: `Suas tarefas no CRM Credios (${dataReferencia})`,
      html,
    });
    if (!result.error) sentConsultores++;
  }

  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.ativo, true), eq(usersTable.perfil, "admin")));
  let sentAdmin = false;
  const stats = await taskStatsByConsultor(dataReferencia);
  if (admins.length > 0) {
    const rows = stats
      .map(
        (s) => `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${s.consultorNome}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${s.total}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${s.concluidas}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#b42318;font-weight:700">${s.atrasadas}</td>
        </tr>`,
      )
      .join("");
    const html = shell(
      "Resumo gerencial de tarefas",
      `<p style="margin-top:0;color:#444">Resumo das tarefas de todos os consultores ativos em ${dataReferencia}.</p>
       <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">Consultor</th><th style="text-align:right;padding:8px;border-bottom:1px solid #ddd">Total</th><th style="text-align:right;padding:8px;border-bottom:1px solid #ddd">Concluídas</th><th style="text-align:right;padding:8px;border-bottom:1px solid #ddd">Atrasadas</th></tr></thead>
        <tbody>${rows || ""}</tbody>
       </table>
       <p style="margin:20px 0 0"><a href="${appUrl("/tarefas?status=todas")}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;padding:10px 14px;font-weight:700">Ver painel de tarefas</a></p>`,
    );
    const result = await resend.emails.send({
      from,
      to: admins.map((a) => a.email),
      replyTo,
      subject: `Resumo de tarefas da equipe (${dataReferencia})`,
      html,
    });
    sentAdmin = !result.error;
  }

  return { ok: true, sentConsultores, sentAdmin };
}

export async function sendOverdueTaskEmail(): Promise<{
  ok: boolean;
  sent: boolean;
  overdue: number;
  reason?: string;
}> {
  if (!resend) return { ok: false, sent: false, overdue: 0, reason: "RESEND_API_KEY ausente" };

  const overdue = await listTasksForUser({
    userId: "admin",
    perfil: "admin",
    status: "atrasada",
  });
  if (overdue.length === 0) return { ok: true, sent: false, overdue: 0 };

  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.ativo, true), eq(usersTable.perfil, "admin")));
  if (admins.length === 0) return { ok: false, sent: false, overdue: overdue.length, reason: "nenhum admin ativo" };

  const items = overdue
    .slice(0, 60)
    .map(
      (t) => `<li style="margin:0 0 10px">
        <a href="${appUrl(`/leads/${t.leadId}`)}" style="color:#1455d9;font-weight:700">${t.leadNome}</a>
        <div style="font-size:13px;color:#555">${t.consultorNome} · ${t.titulo}</div>
      </li>`,
    )
    .join("");

  const result = await resend.emails.send({
    from,
    to: admins.map((a) => a.email),
    replyTo,
    subject: `${overdue.length} tarefas atrasadas no CRM`,
    html: shell(
      "Tarefas atrasadas",
      `<p style="margin-top:0;color:#444">Existem <b>${overdue.length}</b> tarefas atrasadas que precisam de gestão.</p><ul style="padding-left:18px">${items}</ul>`,
    ),
  });

  return { ok: !result.error, sent: !result.error, overdue: overdue.length, reason: result.error?.message };
}
