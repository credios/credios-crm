import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { Resend } from "resend";

import { users as usersTable } from "../../../db/schema";
import { db } from "@/lib/db";
import { formatBrlShort } from "@/lib/formatters/currency";
import {
  appUrl,
  escape,
  kpiRow,
  pill,
  renderEmailLayout,
} from "@/lib/notifications/email-layout";

import {
  listTasksForUser,
  taskStatsByConsultor,
  yesterdayNewUnmovedLeadsByConsultor,
} from "./service";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
const replyTo = process.env.EMAIL_REPLY_TO;
const resend = apiKey ? new Resend(apiKey) : null;

// ============================================================================
// 1. Tarefas do dia (consultor) + 2. Resumo gerencial (admin)
// ============================================================================

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
    .where(
      and(
        eq(usersTable.ativo, true),
        inArray(usersTable.perfil, ["admin", "gerente", "consultor"]),
      ),
    );

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
    const html = renderDailyTasksEmail({
      consultorNome: c.nome,
      tasks,
      atrasadas,
      destaque,
    });

    const result = await resend.emails.send({
      from,
      to: c.email,
      replyTo,
      subject: `Suas tarefas no CRM Credios — ${dataReferencia}`,
      html,
    });
    if (!result.error) sentConsultores++;
  }

  // Resumo gerencial pra admins
  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.ativo, true), eq(usersTable.perfil, "admin")));
  let sentAdmin = false;
  if (admins.length > 0) {
    const stats = await taskStatsByConsultor(dataReferencia);
    const html = renderManagerSummaryEmail({ dataReferencia, stats });
    const result = await resend.emails.send({
      from,
      to: admins.map((a) => a.email),
      replyTo,
      subject: `Resumo de tarefas da equipe — ${dataReferencia}`,
      html,
    });
    sentAdmin = !result.error;
  }

  return { ok: true, sentConsultores, sentAdmin };
}

// ============================================================================
// 3. Tarefas atrasadas (admin)
// ============================================================================

export async function sendOverdueTaskEmail(): Promise<{
  ok: boolean;
  sent: boolean;
  overdue: number;
  reason?: string;
}> {
  if (!resend)
    return {
      ok: false,
      sent: false,
      overdue: 0,
      reason: "RESEND_API_KEY ausente",
    };

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
  if (admins.length === 0)
    return {
      ok: false,
      sent: false,
      overdue: overdue.length,
      reason: "nenhum admin ativo",
    };

  const html = renderOverdueTasksEmail({ overdue });
  const result = await resend.emails.send({
    from,
    to: admins.map((a) => a.email),
    replyTo,
    subject: `${overdue.length} tarefa${overdue.length === 1 ? "" : "s"} atrasada${overdue.length === 1 ? "" : "s"} no CRM`,
    html,
  });

  return {
    ok: !result.error,
    sent: !result.error,
    overdue: overdue.length,
    reason: result.error?.message,
  };
}

// ============================================================================
// Renderers (exportados pra reuso no endpoint de teste)
// ============================================================================

type TaskItem = Awaited<ReturnType<typeof listTasksForUser>>[number];
type StatRow = Awaited<ReturnType<typeof taskStatsByConsultor>>[number];
type UnmovedRow = Awaited<
  ReturnType<typeof yesterdayNewUnmovedLeadsByConsultor>
>[number];

function taskListHtml(items: TaskItem[]): string {
  if (items.length === 0) {
    return `<p style="color:#6b6f7e;font-style:italic;font-family:Inter,Arial,sans-serif;font-size:14px;margin:12px 0">Nenhuma pendência. Bom trabalho.</p>`;
  }
  return items
    .slice(0, 40)
    .map((t) => {
      const tag =
        t.status === "atrasada"
          ? pill("Atrasada", "danger")
          : t.status === "concluida"
            ? pill("Concluída", "success")
            : pill("Hoje", "info");
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px"><tr><td style="background:#fff;border:1px solid #e1ddcf;border-radius:10px;padding:12px 14px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="vertical-align:top">
            <a href="${appUrl(`/leads/${t.leadId}`)}" style="text-decoration:none;color:#141e30;font-weight:700;font-family:'Plus Jakarta Sans',Inter,Arial,sans-serif;font-size:14px">${escape(t.leadNome)}</a>
            <div style="color:#6b6f7e;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.4;margin-top:4px">${escape(t.titulo)} · ${escape(formatBrlShort(t.valorCreditoCentavos))}</div>
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:8px">${tag}</td>
        </tr></table>
      </td></tr></table>`;
    })
    .join("");
}

export function renderDailyTasksEmail(params: {
  consultorNome: string;
  tasks: TaskItem[];
  atrasadas: TaskItem[];
  destaque: UnmovedRow[];
}): string {
  const { consultorNome, tasks, atrasadas, destaque } = params;

  const destaqueHtml =
    destaque.length > 0
      ? `<div style="margin:0 0 18px;padding:14px 16px;background:#fbf2dc;border:1px solid #d4a351;border-radius:10px;font-family:Inter,Arial,sans-serif">
          <div style="font-weight:700;color:#92660d;font-size:14px;margin-bottom:8px">⚠ Leads novos de ontem ainda em "Novo"</div>
          <ul style="margin:0;padding-left:18px;color:#141e30;font-size:14px;line-height:1.7">${destaque
            .map(
              (l) =>
                `<li><a href="${appUrl(`/leads/${l.lead_id}`)}" style="color:#2c4fa8;text-decoration:none;font-weight:600">${escape(l.lead_nome)}</a> — ${escape(formatBrlShort(Number(l.valor_credito_centavos ?? 0)))}</li>`,
            )
            .join("")}</ul>
        </div>`
      : "";

  const ordered = [...atrasadas, ...tasks];
  const content = `${destaqueHtml}
    ${kpiRow([
      {
        label: "Hoje",
        value: String(tasks.length),
        tone: "info",
      },
      {
        label: "Atrasadas",
        value: String(atrasadas.length),
        tone: atrasadas.length > 0 ? "danger" : "secondary",
      },
    ])}
    <h2 style="margin:24px 0 12px;font-size:16px;font-family:'Plus Jakarta Sans',Inter,Arial,sans-serif;color:#141e30">Suas pendências</h2>
    ${taskListHtml(ordered)}`;

  return renderEmailLayout({
    preheader: `${tasks.length} tarefas de hoje + ${atrasadas.length} atrasadas`,
    eyebrow: "Tarefas do dia",
    title: `Bom dia, ${consultorNome.split(" ")[0]}`,
    intro: `Aqui está o resumo das suas tarefas. Foque primeiro nas atrasadas — elas estão segurando o pipeline.`,
    contentHtml: content,
    ctas: [{ href: appUrl("/tarefas"), label: "Abrir tarefas" }],
  });
}

export function renderManagerSummaryEmail(params: {
  dataReferencia: string;
  stats: StatRow[];
}): string {
  const { stats, dataReferencia } = params;
  const totals = stats.reduce(
    (acc, s) => {
      acc.total += s.total;
      acc.concluidas += s.concluidas;
      acc.atrasadas += s.atrasadas;
      return acc;
    },
    { total: 0, concluidas: 0, atrasadas: 0 },
  );
  const taxa =
    totals.total > 0 ? Math.round((totals.concluidas / totals.total) * 100) : 0;

  const tableRows = stats
    .map((s) => {
      const taxaConsultor =
        s.total > 0 ? Math.round((s.concluidas / s.total) * 100) : 0;
      return `<tr>
        <td style="padding:12px 8px;border-bottom:1px solid #e1ddcf;font-family:Inter,Arial,sans-serif;font-size:14px;color:#141e30;font-weight:600">${escape(s.consultorNome)}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e1ddcf;font-family:Inter,Arial,sans-serif;font-size:14px;text-align:right;color:#141e30">${s.total}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e1ddcf;font-family:Inter,Arial,sans-serif;font-size:14px;text-align:right;color:#10b981;font-weight:700">${s.concluidas}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e1ddcf;font-family:Inter,Arial,sans-serif;font-size:14px;text-align:right;color:${s.atrasadas > 0 ? "#dc2626" : "#6b6f7e"};font-weight:${s.atrasadas > 0 ? 700 : 400}">${s.atrasadas}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e1ddcf;font-family:Inter,Arial,sans-serif;font-size:13px;text-align:right;color:#6b6f7e">${taxaConsultor}%</td>
      </tr>`;
    })
    .join("");

  const tableHtml = stats.length === 0
    ? `<p style="color:#6b6f7e;font-style:italic;font-family:Inter,Arial,sans-serif;font-size:14px">Nenhum consultor com tarefas hoje.</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#fff;border:1px solid #e1ddcf;border-radius:10px;overflow:hidden">
        <thead>
          <tr style="background:#f8f6f0">
            <th style="text-align:left;padding:12px 8px;font-family:Inter,Arial,sans-serif;font-size:11px;color:#6b6f7e;text-transform:uppercase;letter-spacing:0.12em;font-weight:700">Consultor</th>
            <th style="text-align:right;padding:12px 8px;font-family:Inter,Arial,sans-serif;font-size:11px;color:#6b6f7e;text-transform:uppercase;letter-spacing:0.12em;font-weight:700">Total</th>
            <th style="text-align:right;padding:12px 8px;font-family:Inter,Arial,sans-serif;font-size:11px;color:#6b6f7e;text-transform:uppercase;letter-spacing:0.12em;font-weight:700">Concluídas</th>
            <th style="text-align:right;padding:12px 8px;font-family:Inter,Arial,sans-serif;font-size:11px;color:#6b6f7e;text-transform:uppercase;letter-spacing:0.12em;font-weight:700">Atrasadas</th>
            <th style="text-align:right;padding:12px 8px;font-family:Inter,Arial,sans-serif;font-size:11px;color:#6b6f7e;text-transform:uppercase;letter-spacing:0.12em;font-weight:700">Taxa</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`;

  const content = `${kpiRow([
    { label: "Total", value: String(totals.total), tone: "info" },
    {
      label: "Concluídas",
      value: String(totals.concluidas),
      tone: "success",
    },
    {
      label: "Atrasadas",
      value: String(totals.atrasadas),
      tone: totals.atrasadas > 0 ? "danger" : "secondary",
    },
    { label: "Taxa", value: `${taxa}%` },
  ])}
  <h2 style="margin:24px 0 12px;font-size:16px;font-family:'Plus Jakarta Sans',Inter,Arial,sans-serif;color:#141e30">Por consultor</h2>
  ${tableHtml}`;

  return renderEmailLayout({
    preheader: `${totals.atrasadas} atrasadas · ${taxa}% de conclusão`,
    eyebrow: "Resumo gerencial",
    title: `Tarefas da equipe · ${dataReferencia}`,
    intro: `Visão consolidada das tarefas dos consultores. ${totals.atrasadas > 0 ? "Há atrasadas a tratar." : "Tudo em dia."}`,
    contentHtml: content,
    ctas: [
      { href: appUrl("/tarefas?status=todas"), label: "Ver painel" },
      {
        href: appUrl("/relatorios"),
        label: "Relatórios",
        tone: "secondary",
      },
    ],
  });
}

export function renderOverdueTasksEmail(params: { overdue: TaskItem[] }): string {
  const { overdue } = params;
  const items = overdue
    .slice(0, 60)
    .map(
      (t) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px"><tr><td style="background:#fff;border:1px solid #e1ddcf;border-radius:10px;padding:12px 14px">
        <a href="${appUrl(`/leads/${t.leadId}`)}" style="text-decoration:none;color:#141e30;font-weight:700;font-family:'Plus Jakarta Sans',Inter,Arial,sans-serif;font-size:14px">${escape(t.leadNome)}</a>
        <div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#6b6f7e;line-height:1.4;margin-top:4px">${escape(t.consultorNome)} · ${escape(t.titulo)}</div>
      </td></tr></table>`,
    )
    .join("");

  return renderEmailLayout({
    preheader: `${overdue.length} tarefa${overdue.length === 1 ? "" : "s"} atrasada${overdue.length === 1 ? "" : "s"} aguardando ação`,
    eyebrow: "Alerta de atraso",
    eyebrowTone: "danger",
    title: `${overdue.length} tarefa${overdue.length === 1 ? "" : "s"} atrasada${overdue.length === 1 ? "" : "s"}`,
    intro:
      "Tarefas que passaram do prazo precisam de gestão direta — cobrança ao consultor ou redistribuição.",
    contentHtml: items,
    ctas: [
      {
        href: appUrl("/tarefas?status=atrasada"),
        label: "Ver atrasadas",
      },
    ],
  });
}
