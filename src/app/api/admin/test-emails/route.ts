import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";

import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import {
  renderLeadAssignedEmail,
  renderNewLeadEmail,
} from "@/lib/notifications/email";
import { renderSlaAlertEmail } from "@/lib/sla/notify";
import {
  renderDailyTasksEmail,
  renderManagerSummaryEmail,
  renderOverdueTasksEmail,
} from "@/lib/tasks/email";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Endpoint admin pra mandar amostra de cada email com dados fictícios
 * pro próprio email do admin logado (ou pro `to` query param se passado).
 *
 * Uso: GET /api/admin/test-emails?type=daily
 *      GET /api/admin/test-emails?type=daily&to=outro@dominio.com
 *
 * Tipos: daily | manager | overdue | sla | new-lead | all
 *
 * NÃO toca no banco — usa fixtures montadas inline. Seguro pra rodar
 * quantas vezes quiser sem efeito colateral.
 */
export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: "RESEND_API_KEY ausente — adicione no Vercel" },
      { status: 500 },
    );

  const url = new URL(request.url);
  const type = (url.searchParams.get("type") ?? "daily") as TestType;
  const to = url.searchParams.get("to") ?? user.email;

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
  const replyTo = process.env.EMAIL_REPLY_TO;

  const samples = await buildSamples(user.nome);
  type SampleKey = keyof typeof samples;
  const list: SampleKey[] =
    type === "all"
      ? (Object.keys(samples) as SampleKey[])
      : ([type] as SampleKey[]);
  const results: Array<{ type: SampleKey; ok: boolean; reason?: string }> = [];

  for (const t of list) {
    const sample = samples[t];
    if (!sample) {
      results.push({ type: t, ok: false, reason: "tipo desconhecido" });
      continue;
    }
    try {
      const r = await resend.emails.send({
        from,
        to,
        replyTo,
        subject: `[TESTE] ${sample.subject}`,
        html: sample.html,
      });
      if (r.error) {
        results.push({ type: t, ok: false, reason: r.error.message });
      } else {
        results.push({ type: t, ok: true });
      }
    } catch (e) {
      results.push({
        type: t,
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ to, results });
}

type TestType =
  | "daily"
  | "manager"
  | "overdue"
  | "sla"
  | "new-lead"
  | "lead-assigned"
  | "all";

async function buildSamples(adminNome: string): Promise<
  Record<Exclude<TestType, "all">, { subject: string; html: string }>
> {
  const fakeLead = {
    id: "00000000-0000-0000-0000-000000000001",
    nome: "Maria da Silva (TESTE)",
    cpf: "111.111.111-11",
    estadoCivil: "Casado(a)",
    ocupacao: "Empresário",
    rendaMensalCentavos: 2500000,
    whatsapp: "+5547999990000",
    email: "maria.teste@example.com",
    cidade: "Blumenau",
    estado: "SC",
    produto: "CGI",
    objetivoCredito: "Capital de Giro",
    tipoImovel: "Casa",
    situacaoImovel: "Quitado",
    tipoPessoa: "Pessoa Física",
    valorImovelCentavos: 90000000,
    saldoDevedorCentavos: null,
    valorCreditoCentavos: 35000000,
    status: "novo",
    motivoDesqualificacao: null,
    consultorId: null,
    atribuidoEm: null,
    atribuidoPor: null,
    origem: "Google",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "cgi-blumenau-2026",
    utmTerm: "credito imovel",
    utmContent: null,
    gclid: null,
    fbclid: null,
    msclkid: null,
    ttclid: null,
    wbraid: null,
    gbraid: null,
    rede: "Google Search",
    dispositivo: "Mobile",
    palavraChave: "credito com garantia",
    grupoAnuncios: null,
    criativo: null,
    tipoCorrespondencia: "Frase",
    referrer: null,
    paginaEntrada: "/cgi",
    bancoAprovador: null,
    valorLiberadoCentavos: null,
    comissaoCentavos: null,
    dataFechamento: null,
    rawPayload: null,
    notionId: null,
    ultimoContato: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
  };

  const fakeTask = (
    over: Partial<{
      id: string;
      leadNome: string;
      titulo: string;
      status: "aberta" | "atrasada" | "concluida";
      valor: number;
    }> = {},
  ) => ({
    id: over.id ?? "task-1",
    leadId: "00000000-0000-0000-0000-000000000001",
    leadNome: over.leadNome ?? "Maria da Silva (TESTE)",
    titulo: over.titulo ?? "Fazer acompanhamento do lead",
    descricao: null,
    status: over.status ?? "aberta",
    consultorId: "consultor-1",
    consultorNome: "Rodrigo (TESTE)",
    leadStatus: "novo",
    valorCreditoCentavos: over.valor ?? 35000000,
    origem: "Google",
    dataReferencia: new Date().toISOString().slice(0, 10),
    venceEm: new Date(),
    concluidaEm: null,
    acaoConclusao: null,
    observacaoConclusao: null,
    createdAt: new Date(),
  });

  const tasks = [
    fakeTask({ id: "t1", titulo: "Cobrar documentação" }),
    fakeTask({
      id: "t2",
      leadNome: "João Pedro (TESTE)",
      titulo: "Retornar ligação",
      valor: 15000000,
    }),
  ];
  const atrasadas = [
    fakeTask({
      id: "t3",
      leadNome: "Carlos Santos (TESTE)",
      titulo: "Atualizar status no banco parceiro",
      status: "atrasada",
      valor: 65000000,
    }),
  ];

  const stats = [
    { consultorId: "u1", consultorNome: "Rodrigo (TESTE)", total: 12, abertas: 5, atrasadas: 2, concluidas: 5 },
    { consultorId: "u2", consultorNome: "Ana Maria (TESTE)", total: 8, abertas: 1, atrasadas: 0, concluidas: 7 },
  ];

  const slaAlerts = [
    {
      alertaId: "alert-1",
      leadId: "00000000-0000-0000-0000-000000000001",
      leadNome: "Maria da Silva (TESTE)",
      consultorId: "u1",
      atribuidoEm: new Date(Date.now() - 45 * 60_000),
    },
    {
      alertaId: "alert-2",
      leadId: "00000000-0000-0000-0000-000000000002",
      leadNome: "Pedro Souza (TESTE)",
      consultorId: "u2",
      atribuidoEm: new Date(Date.now() - 90 * 60_000),
    },
  ];

  return {
    daily: {
      subject: "Suas tarefas no CRM Credios — sample",
      html: renderDailyTasksEmail({
        consultorNome: adminNome,
        tasks,
        atrasadas,
        destaque: [
          {
            consultor_id: "u1",
            lead_id: "00000000-0000-0000-0000-000000000099",
            lead_nome: "Lead que ficou no Novo (TESTE)",
            valor_credito_centavos: "42000000",
          },
        ],
      }),
    },
    manager: {
      subject: "Resumo de tarefas da equipe — sample",
      html: renderManagerSummaryEmail({
        dataReferencia: new Date().toISOString().slice(0, 10),
        stats,
      }),
    },
    overdue: {
      subject: "1 tarefa atrasada no CRM — sample",
      html: renderOverdueTasksEmail({ overdue: atrasadas }),
    },
    sla: {
      subject: "2 leads sem 1º contato (>30min) — sample",
      html: renderSlaAlertEmail({ novos: slaAlerts }),
    },
    "new-lead": {
      subject: "Novo lead: Maria da Silva (TESTE)",
      html: renderNewLeadEmail({ lead: fakeLead }),
    },
    "lead-assigned": {
      subject: "Novo lead pra você: Maria da Silva (TESTE)",
      html: renderLeadAssignedEmail({
        lead: fakeLead,
        consultorNome: adminNome,
      }),
    },
  };
}
