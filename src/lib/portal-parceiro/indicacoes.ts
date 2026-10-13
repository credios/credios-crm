import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, ne, notInArray, or, sql } from "drizzle-orm";

import {
  interacoes,
  leadCondominio,
  leads,
  parceiroComissoes,
  users as usersTable,
} from "../../../db/schema";
import { logAction } from "@/lib/audit";
import { salvarCondominio } from "@/lib/condominio/persist";
import { db } from "@/lib/db";
import { formatProperName } from "@/lib/formatters/proper-name";
import { sendLeadAssignedEmail, sendNewLeadEmail } from "@/lib/notifications/email";
import { realRoutingDeps } from "@/lib/routing/db-deps";
import { aplicarRoteamento } from "@/lib/routing/engine";
import { condominioSchema } from "@/lib/validators/condominio";
import type { IndicacaoInput } from "@/lib/validators/indicacao";
import { normalizarWhatsapp } from "@/lib/validators/webhook";

import { sendIndicacaoRecebidaEmail } from "./email";
import { prequalCgi } from "./prequal";
import type { ParceiroSessao } from "./sessao";
import { etapaDoStatus, type Etapa } from "./status";

// Indicações do parceiro = leads com `parceiro_id` dele. TODA leitura aqui
// filtra por parceiro_id da sessão: o parceiro nunca passa um id de lead que
// não seja dele, e nunca recebe campo interno (consultor, anotações, banco).

const SOURCE = "Portal de Parceiros";
const REINDICAR_APOS_DIAS = 90;

export type ResultadoIndicacao =
  | { ok: true; leadId: string }
  | { ok: false; duplicadaPropria: string }
  | { ok: false; erro: string; campos?: Record<string, string> };

/**
 * Regra comercial (herdada do portal antigo): primeiro a cadastrar tem
 * prioridade. Bloqueia se já existe lead com o mesmo documento que esteja
 * ativo, fechado, ou encerrado (perdido/desqualificado) há menos de 90 dias.
 */
async function buscarDuplicado(input: IndicacaoInput) {
  const corte = new Date(Date.now() - REINDICAR_APOS_DIAS * 24 * 60 * 60 * 1000);
  const bloqueia = or(
    notInArray(leads.status, ["perdido", "desqualificado"]),
    gte(leads.updatedAt, corte),
  );
  const campos = { id: leads.id, parceiroId: leads.parceiroId };

  if (input.produto === "CONDOMINIO") {
    const [row] = await db
      .select(campos)
      .from(leads)
      .innerJoin(leadCondominio, eq(leadCondominio.leadId, leads.id))
      .where(and(eq(leadCondominio.cnpj, input.documento), bloqueia))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    return row ?? null;
  }
  // CGI com CNPJ: `leads.cpf` só guarda CPF — sem chave pra deduplicar.
  if (input.documento.length !== 11) return null;
  const [row] = await db
    .select(campos)
    .from(leads)
    .where(and(eq(leads.cpf, input.documento), bloqueia))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return row ?? null;
}

export async function criarIndicacao(
  sessao: ParceiroSessao,
  input: IndicacaoInput,
): Promise<ResultadoIndicacao> {
  if (!sessao.produtosHabilitados.includes(input.produto)) {
    return { ok: false, erro: "Você não está habilitado a indicar este produto." };
  }

  if (input.produto === "CGI") {
    const campos = prequalCgi(input);
    if (Object.keys(campos).length > 0) {
      return { ok: false, erro: "A operação não se enquadra na política de crédito.", campos };
    }
  }

  const duplicado = await buscarDuplicado(input);
  if (duplicado) {
    if (duplicado.parceiroId === sessao.parceiroId) {
      return { ok: false, duplicadaPropria: duplicado.id };
    }
    // Avisa a equipe na timeline do lead existente; pro parceiro, mensagem
    // neutra — não revela quem indicou nem que o cliente já é da Credios.
    await db.insert(interacoes).values({
      leadId: duplicado.id,
      autorId: null,
      tipo: "evento_sistema",
      conteudo: `O parceiro ${sessao.parceiroNome} tentou indicar este cliente pelo portal. Regra aplicada: primeiro a cadastrar tem prioridade.`,
      metadata: { kind: "indicacao_duplicada", parceiroId: sessao.parceiroId } as never,
    });
    return { ok: false, erro: "Este cliente já possui uma indicação ativa na Credios." };
  }

  const cgi = input.produto === "CGI" ? input : null;
  const routing = await aplicarRoteamento(
    {
      valorCreditoCentavos: input.valorCreditoCentavos,
      valorImovelCentavos: cgi?.valorImovelCentavos ?? null,
      estado: input.estado,
      origem: SOURCE,
      tipoImovel: cgi?.tipoImovel ?? null,
      produto: input.produto,
    },
    realRoutingDeps,
  );

  const { consentimento: _consentimento, ...semConsentimento } = input;
  void _consentimento;
  const [novo] = await db
    .insert(leads)
    .values({
      nome: formatProperName(input.nome),
      cpf: cgi && input.documento.length === 11 ? input.documento : null,
      whatsapp: normalizarWhatsapp(input.whatsapp),
      email: input.email,
      cidade: input.cidade,
      estado: input.estado,
      produto: input.produto,
      tipoPessoa: input.documento.length === 14 ? "Pessoa Jurídica" : "Pessoa Física",
      valorCreditoCentavos: input.valorCreditoCentavos,
      ...(cgi
        ? {
            tipoImovel: cgi.tipoImovel,
            valorImovelCentavos: cgi.valorImovelCentavos,
            rendaMensalCentavos: cgi.rendaTitularCentavos,
            saldoDevedorCentavos: cgi.saldoDevedorCentavos > 0 ? cgi.saldoDevedorCentavos : null,
            situacaoImovel: cgi.saldoDevedorCentavos > 0 ? "Financiado" : "Quitado",
            conjugeCompoeRenda: cgi.rendaConjugeCentavos > 0 ? true : null,
            conjugeRendaCentavos: cgi.rendaConjugeCentavos > 0 ? cgi.rendaConjugeCentavos : null,
          }
        : {}),
      ...(input.produto === "CONDOMINIO" ? { objetivoCredito: input.finalidade } : {}),
      parceiroId: sessao.parceiroId,
      parceiroNome: sessao.parceiroNome,
      observacoesParceiro: input.observacoes,
      consultorId: routing.consultorId,
      atribuidoEm: routing.consultorId ? new Date() : null,
      channel: "Referral",
      source: SOURCE,
      paid: false,
      origem: SOURCE,
      rawPayload: {
        via: "portal_parceiro",
        consentimentoEm: new Date().toISOString(),
        indicadoPor: sessao.usuarioId,
        ...semConsentimento,
      } as never,
    })
    .returning();
  const lead = novo!;

  if (input.produto === "CONDOMINIO") {
    await salvarCondominio(
      lead.id,
      condominioSchema.parse({
        cnpj: input.documento,
        sindicoNome: input.sindicoNome,
        numUnidades: input.numUnidades ?? null,
        administradora: input.administradora,
      }),
    );
  }

  await db.insert(interacoes).values({
    leadId: lead.id,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: `Indicação de ${sessao.parceiroNome} pelo portal de parceiros (${routing.regraAplicada})`,
    metadata: { source: SOURCE, parceiroId: sessao.parceiroId, routing } as never,
  });

  return { ok: true, leadId: lead.id };
}

/**
 * Auditoria + e-mails (admins, consultor atribuído, confirmação ao parceiro).
 * Chamado pela rota dentro de `after()`: não segura a resposta, e falha aqui
 * não desfaz a indicação.
 */
export async function notificarIndicacao(
  leadId: string,
  sessao: ParceiroSessao,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return;
  await logAction(null, null, "lead_criado_portal_parceiro", "lead", lead.id, {
    parceiroId: sessao.parceiroId,
    produto: lead.produto,
  }, meta);

  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.perfil, "admin"), eq(usersTable.ativo, true)));
  const destinatarios = admins.map((a) => a.email).filter(Boolean);
  if (destinatarios.length > 0) await sendNewLeadEmail(lead, destinatarios);

  if (lead.consultorId) {
    const [c] = await db
      .select({ email: usersTable.email, nome: usersTable.nome })
      .from(usersTable)
      .where(eq(usersTable.id, lead.consultorId))
      .limit(1);
    if (c?.email) await sendLeadAssignedEmail(lead, c.email, c.nome);
  }
  await sendIndicacaoRecebidaEmail({
    nome: sessao.nome,
    email: sessao.email,
    clienteNome: lead.nome,
    leadId: lead.id,
  });
}

// ── Leituras ───────────────────────────────────────────────────────────────

export type IndicacaoResumo = {
  id: string;
  nome: string;
  produto: string;
  valorCreditoCentavos: number | null;
  etapa: Etapa;
  atualizadoEm: Date;
  criadoEm: Date;
};

export async function listarIndicacoes(
  parceiroId: string,
  filtros: { q?: string } = {},
): Promise<IndicacaoResumo[]> {
  const conds = [eq(leads.parceiroId, parceiroId)];
  const q = filtros.q?.trim();
  if (q) conds.push(ilike(leads.nome, `%${q.replace(/[%_\\]/g, "\\$&")}%`));

  const rows = await db
    .select({
      id: leads.id,
      nome: leads.nome,
      produto: leads.produto,
      valorCreditoCentavos: leads.valorCreditoCentavos,
      status: leads.status,
      atualizadoEm: leads.updatedAt,
      criadoEm: leads.createdAt,
    })
    .from(leads)
    .where(and(...conds))
    .orderBy(desc(leads.createdAt))
    .limit(500);

  return rows.map(({ status, ...r }) => ({ ...r, etapa: etapaDoStatus(status) }));
}

export type IndicacaoDetalhe = IndicacaoResumo & {
  cidade: string | null;
  estado: string | null;
  observacoes: string | null;
  valorLiberadoCentavos: number | null;
  historico: { etapa: Etapa; em: Date }[];
};

/** Detalhe de UMA indicação do parceiro. null se não existe ou não é dele. */
export async function buscarIndicacao(
  parceiroId: string,
  leadId: string,
): Promise<IndicacaoDetalhe | null> {
  const [l] = await db
    .select({
      id: leads.id,
      nome: leads.nome,
      produto: leads.produto,
      valorCreditoCentavos: leads.valorCreditoCentavos,
      valorLiberadoCentavos: leads.valorLiberadoCentavos,
      status: leads.status,
      cidade: leads.cidade,
      estado: leads.estado,
      observacoes: leads.observacoesParceiro,
      atualizadoEm: leads.updatedAt,
      criadoEm: leads.createdAt,
    })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.parceiroId, parceiroId)))
    .limit(1);
  if (!l) return null;

  // Histórico = só as mudanças de status, traduzidas pra etapa pública e sem
  // repetição (dois status internos da mesma etapa viram uma linha só).
  const mudancas = await db
    .select({
      para: sql<string | null>`${interacoes.metadata} ->> 'para'`,
      em: interacoes.criadoEm,
    })
    .from(interacoes)
    .where(and(eq(interacoes.leadId, leadId), eq(interacoes.tipo, "mudanca_status")))
    .orderBy(asc(interacoes.criadoEm));

  const historico: { etapa: Etapa; em: Date }[] = [{ etapa: "recebida", em: l.criadoEm }];
  for (const m of mudancas) {
    if (!m.para) continue;
    const etapa = etapaDoStatus(m.para);
    if (historico[historico.length - 1]!.etapa !== etapa) historico.push({ etapa, em: m.em });
  }

  const etapa = etapaDoStatus(l.status);
  const { status: _status, ...resto } = l;
  void _status;
  return {
    ...resto,
    etapa,
    // Valor liberado só aparece quando a operação fechou.
    valorLiberadoCentavos: etapa === "liberada" ? l.valorLiberadoCentavos : null,
    historico,
  };
}

export type ComissaoDoParceiro = {
  id: string;
  clienteNome: string | null;
  descricao: string | null;
  baseCentavos: number | null;
  percentualBps: number | null;
  valorCentavos: number;
  status: string;
  pagoEm: string | null;
};

/** Comissões do parceiro (sem as canceladas e sem observação interna). */
export async function listarComissoes(parceiroId: string): Promise<ComissaoDoParceiro[]> {
  return db
    .select({
      id: parceiroComissoes.id,
      clienteNome: leads.nome,
      descricao: parceiroComissoes.descricao,
      baseCentavos: parceiroComissoes.baseCentavos,
      percentualBps: parceiroComissoes.percentualBps,
      valorCentavos: parceiroComissoes.valorCentavos,
      status: parceiroComissoes.status,
      pagoEm: parceiroComissoes.pagoEm,
    })
    .from(parceiroComissoes)
    .leftJoin(leads, eq(leads.id, parceiroComissoes.leadId))
    .where(
      and(
        eq(parceiroComissoes.parceiroId, parceiroId),
        ne(parceiroComissoes.status, "cancelada"),
      ),
    )
    .orderBy(desc(parceiroComissoes.createdAt));
}

export async function resumoDoParceiro(parceiroId: string) {
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      emAndamento: sql<number>`count(*) filter (where ${leads.status} not in ('fechado','perdido','desqualificado'))::int`,
      liberadas: sql<number>`count(*) filter (where ${leads.status} = 'fechado')::int`,
    })
    .from(leads)
    .where(eq(leads.parceiroId, parceiroId));
  const [c] = await db
    .select({
      aReceber: sql<string>`coalesce(sum(${parceiroComissoes.valorCentavos}) filter (where ${inArray(parceiroComissoes.status, ["prevista", "a_pagar"])}), 0)::text`,
      recebido: sql<string>`coalesce(sum(${parceiroComissoes.valorCentavos}) filter (where ${parceiroComissoes.status} = 'paga'), 0)::text`,
    })
    .from(parceiroComissoes)
    .where(eq(parceiroComissoes.parceiroId, parceiroId));
  return {
    total: r?.total ?? 0,
    emAndamento: r?.emAndamento ?? 0,
    liberadas: r?.liberadas ?? 0,
    aReceberCentavos: Number(c?.aReceber ?? 0),
    recebidoCentavos: Number(c?.recebido ?? 0),
  };
}
