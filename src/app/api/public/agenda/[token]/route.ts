import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable, users as usersTable } from "../../../../../../db/schema";
import { consultorAgendaEmail, elegivelAgendaPublica } from "@/lib/agenda/prequal";
import { diasAgendaPublica, validarSlotPublico } from "@/lib/agenda/slots";
import { validarAgendaToken } from "@/lib/agenda/token";
import { aoMudarStatusCadencia } from "@/lib/cadencia/engine";
import { desfechoReuniaoMoveLead } from "@/lib/cadencia/tipos";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  sendReuniaoConfirmadaEmail,
  sendReuniaoConsultorEmail,
} from "@/lib/notifications/email";
import { generatePortalToken, portalUrl } from "@/lib/portal/token";
import { agendarReuniao, reuniaoAtivaDoLead } from "@/lib/sdr/agendar";

export const dynamic = "force-dynamic";

// API PÚBLICA da agenda (consumida pela tela de sucesso do simulador, no site).
// Gate: token HMAC assinado emitido pelo webhook só pra leads que passam na
// pré-qualificação determinística (src/lib/agenda/prequal.ts). CORS restrito
// ao domínio do site.

const ORIGENS_PERMITIDAS = new Set([
  "https://credios.com.br",
  "https://www.credios.com.br",
  "http://localhost:3000",
  "http://localhost:3001",
]);

function cors(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  if (!ORIGENS_PERMITIDAS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

type Ctx = { params: Promise<{ token: string }> };

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

async function resolverLead(token: string) {
  const leadId = validarAgendaToken(token);
  if (!leadId) return null;
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);
  return lead ?? null;
}

async function consultorPorEmail(email: string) {
  const [u] = await db
    .select({ id: usersTable.id, email: usersTable.email, nome: usersTable.nome })
    .from(usersTable)
    .where(and(eq(usersTable.email, email), eq(usersTable.ativo, true)))
    .limit(1);
  return u ?? null;
}

type LeadRow = { consultorId: string | null; valorCreditoCentavos: number | null };

/**
 * Quem pode agendar: lead que passa na pré-qualificação do simulador OU lead
 * que JÁ TEM consultor (o link veio da cadência de follow-up — o consultor
 * decidiu convidar; a régua determinística não se aplica).
 */
function podeAgendar(lead: LeadRow & Parameters<typeof elegivelAgendaPublica>[0]): boolean {
  return !!lead.consultorId || elegivelAgendaPublica(lead);
}

/** Consultor dono da agenda: o do lead, se atribuído; senão a régua por valor. */
async function resolverConsultor(lead: LeadRow) {
  if (lead.consultorId) {
    const [u] = await db
      .select({ id: usersTable.id, email: usersTable.email, nome: usersTable.nome })
      .from(usersTable)
      .where(and(eq(usersTable.id, lead.consultorId), eq(usersTable.ativo, true)))
      .limit(1);
    if (u) return u;
  }
  return consultorPorEmail(consultorAgendaEmail(lead.valorCreditoCentavos));
}

/** GET → grade de horários (2 dias) do consultor certo pro lead. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const headers = cors(request);
  const { token } = await params;
  const lead = await resolverLead(token);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404, headers });
  if (!podeAgendar(lead)) {
    return NextResponse.json({ error: "nao elegivel" }, { status: 403, headers });
  }

  // Já tem reunião futura? Devolve o estado agendado (página mostra confirmação).
  const ativa = await reuniaoAtivaDoLead(lead.id);
  if (ativa) {
    return NextResponse.json(
      { jaAgendada: true, quando: ativa.rotulo, consultor: ativa.consultorNome },
      { headers },
    );
  }

  const consultor = await resolverConsultor(lead);
  if (!consultor) {
    return NextResponse.json({ error: "indisponivel" }, { status: 503, headers });
  }
  const dias = await diasAgendaPublica(consultor.email);
  return NextResponse.json(
    {
      jaAgendada: false,
      primeiroNome: lead.nome?.split(/\s+/)[0] ?? "",
      consultor: consultor.nome.split(/\s+/)[0] ?? consultor.nome,
      dias,
    },
    { headers },
  );
}

/** POST {inicio} → agenda a reunião (Meet + CRM + e-mails). */
export async function POST(request: NextRequest, { params }: Ctx) {
  const headers = cors(request);
  // 10 agendamentos/min por IP — cada POST cria evento no Google + e-mails.
  if (!rateLimit(`agenda:${clientIp(request.headers)}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429, headers });
  }
  const { token } = await params;
  const lead = await resolverLead(token);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404, headers });
  if (!podeAgendar(lead)) {
    return NextResponse.json({ error: "nao elegivel" }, { status: 403, headers });
  }
  // Lead encerrado (fechado/perdido/desqualificado) não agenda por link antigo
  // — reabrir funil é decisão do time, não de um clique 48h depois.
  if (["fechado", "perdido", "desqualificado"].includes(lead.status)) {
    return NextResponse.json({ error: "nao elegivel" }, { status: 403, headers });
  }

  let body: { inicio?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers });
  }
  const inicioISO = typeof body.inicio === "string" ? body.inicio : null;
  if (!inicioISO) {
    return NextResponse.json({ error: "inicio obrigatório" }, { status: 400, headers });
  }

  // Idempotência de duplo clique / retry: já tem reunião futura → devolve ela.
  const ativa = await reuniaoAtivaDoLead(lead.id);
  if (ativa) {
    return NextResponse.json(
      { ok: true, jaAgendada: true, quando: ativa.rotulo },
      { headers },
    );
  }

  const consultor = await resolverConsultor(lead);
  if (!consultor) {
    return NextResponse.json({ error: "indisponivel" }, { status: 503, headers });
  }

  // O horário precisa ser um dos slots atualmente ofertados (grade + agenda livre).
  const chk = await validarSlotPublico(consultor.email, inicioISO);
  if (!chk.ok) {
    return NextResponse.json({ error: "horario indisponivel" }, { status: 409, headers });
  }

  const ag = await agendarReuniao({
    leadId: lead.id,
    leadNome: lead.nome ?? "",
    consultorId: consultor.id,
    consultorEmail: consultor.email,
    clienteEmail: lead.email,
    inicioISO: new Date(inicioISO).toISOString(),
    fimISO: chk.fimISO,
  });

  // Move o lead no funil + atribui + SUPRIME a Heloísa (cliente já agendou —
  // desnecessário a IA entrar em contato; o proativo pula qualif != null e o
  // fluxo de remarcação continua disponível se o cliente escrever).
  // Lead que JÁ AVANÇOU além da reunião (docs, negociação) agenda normalmente
  // mas NÃO regride — a reunião entra na agenda e o status fica onde está.
  const deveMoverStatus = desfechoReuniaoMoveLead(lead.status);
  await db
    .update(leadsTable)
    .set({
      ...(deveMoverStatus ? { status: "reuniao_agendada" } : {}),
      consultorId: consultor.id,
      atribuidoEm: lead.atribuidoEm ?? new Date(),
      qualifWhatsappStatus: "concluida",
      qualifWhatsappEm: new Date(),
    })
    .where(eq(leadsTable.id, lead.id));
  if (lead.consultorId !== consultor.id) {
    // Atribuição visível na timeline/auditoria (antes ficava invisível).
    await db.insert(interacoes).values({
      leadId: lead.id,
      autorId: null,
      tipo: "mudanca_atribuicao",
      conteudo: `Atribuído a ${consultor.nome} pela agenda pública (cliente escolheu o horário).`,
      metadata: {
        de: lead.consultorId,
        para: consultor.id,
        canal: "agenda_publica",
        automatico: true,
      } as never,
    });
  }
  if (deveMoverStatus && lead.status !== "reuniao_agendada") {
    await db.insert(interacoes).values({
      leadId: lead.id,
      autorId: null,
      tipo: "mudanca_status",
      conteudo: `Status alterado de ${lead.status} para reuniao_agendada`,
      metadata: {
        de: lead.status,
        para: "reuniao_agendada",
        canal: "agenda_publica",
        automatico: true,
      } as never,
    });
  }
  await db.insert(interacoes).values({
    leadId: lead.id,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: `Cliente escolheu o horário na página do simulador — ${ag.rotulo}.`,
    metadata: { canal: "agenda_publica", reuniaoId: ag.reuniaoId } as never,
  });
  // reuniao_agendada não tem cadência → limpa qualquer estado anterior.
  if (deveMoverStatus) await aoMudarStatusCadencia(lead.id, "reuniao_agendada");

  // E-mails (best-effort): confirmação branded pro cliente + aviso ao consultor.
  let docsUrl: string | null = null;
  try {
    const { token: pt } = await generatePortalToken(lead.id);
    const u = portalUrl(pt);
    docsUrl = u.startsWith("http") ? u : null;
  } catch {
    docsUrl = null;
  }
  if (lead.email) {
    await sendReuniaoConfirmadaEmail({
      to: lead.email,
      primeiroNome: lead.nome?.split(/\s+/)[0] ?? "",
      consultorNome: consultor.nome,
      quando: ag.rotulo,
      meetLink: ag.meetLink,
      docsUrl,
    }).catch((e) => console.error("[agenda-publica] email cliente falhou:", e));
  }
  await sendReuniaoConsultorEmail({
    to: consultor.email,
    consultorNome: consultor.nome,
    lead,
    quando: ag.rotulo,
    meetLink: ag.meetLink,
    tipo: "agendada",
    origem: "agenda_publica",
  }).catch((e) => console.error("[agenda-publica] email consultor falhou:", e));

  console.log(`[agenda-publica] reunião marcada pelo cliente: lead ${lead.id} → ${ag.rotulo}`);
  return NextResponse.json(
    {
      ok: true,
      quando: ag.rotulo,
      meetLink: ag.meetLink,
      consultor: consultor.nome.split(/\s+/)[0] ?? consultor.nome,
    },
    { status: 201, headers },
  );
}
