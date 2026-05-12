import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";

import {
  leads as leadsTable,
  slaAlertas,
  users as usersTable,
} from "../../../db/schema";
import { type AppUser } from "@/lib/auth/get-app-user";
import { maskLeadForPerfil } from "@/lib/auth/mascaramento";
import { endOfDayBrt, startOfDayBrt } from "@/lib/datetime/brt";
import { db } from "@/lib/db";
import type { ListLeadsQuery, StatusLead } from "@/lib/validators/lead";

export type LeadRow = Awaited<ReturnType<typeof rawQuery>>[number] & {
  rendaFaixa?: string | null;
  /** True se há SLA `primeiro_contato_atrasado` ativo (resolvido_em IS NULL). */
  slaAtrasado?: boolean;
};

/**
 * Mapeia `sortBy` da query string pra colunas Drizzle.
 * Sempre adiciona um tiebreaker estável (createdAt desc) pra paginação
 * determinística mesmo quando muitos leads têm a mesma chave de ordenação.
 */
function orderingClause(filters: ListLeadsQuery) {
  const dir = filters.sortDir === "asc" ? asc : desc;
  const tiebreaker = desc(leadsTable.createdAt);
  switch (filters.sortBy) {
    case "criado_em":
      return [dir(leadsTable.createdAt)];
    case "atualizado_em":
      return [dir(leadsTable.updatedAt), tiebreaker];
    case "ultimo_contato":
      // NULLS LAST quando desc, NULLS FIRST quando asc não é o que queremos
      // (asc = "menos recente" — quem nunca teve contato vai pro topo, útil
      // pra triagem). NULLS pra final/início conforme direção:
      return [
        sql`${leadsTable.ultimoContato} ${
          filters.sortDir === "asc" ? sql`asc nulls first` : sql`desc nulls last`
        }`,
        tiebreaker,
      ];
    case "nome":
      return [dir(leadsTable.nome), tiebreaker];
    case "valor_credito":
      return [
        sql`${leadsTable.valorCreditoCentavos} ${
          filters.sortDir === "asc" ? sql`asc nulls last` : sql`desc nulls last`
        }`,
        tiebreaker,
      ];
    case "status":
      // Ordenação pela ORDEM do funil (status_lead_config.ordem) — mesma
      // sequência do Kanban (novo → conversa_inicial → ... → fechado).
      // Subquery escalar; status_lead_config tem 10-20 rows e fica em
      // cache de plano, custo desprezível. NULLS LAST cobre status que
      // não existem mais em status_lead_config (raro mas defensivo).
      return [
        sql`(SELECT ordem FROM public.status_lead_config WHERE key = ${leadsTable.status}) ${
          filters.sortDir === "asc" ? sql`asc nulls last` : sql`desc nulls last`
        }`,
        tiebreaker,
      ];
    case "origem":
      return [
        sql`${leadsTable.origem} ${
          filters.sortDir === "asc" ? sql`asc nulls last` : sql`desc nulls last`
        }`,
        tiebreaker,
      ];
  }
}

async function activeSlaLeadIds(leadIds: string[]): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();
  const rows = await db
    .select({ leadId: slaAlertas.leadId })
    .from(slaAlertas)
    .where(
      and(
        inArray(slaAlertas.leadId, leadIds),
        eq(slaAlertas.tipo, "primeiro_contato_atrasado"),
        isNull(slaAlertas.resolvidoEm),
      ),
    );
  return new Set(rows.map((r) => r.leadId));
}

export type ListLeadsResult = {
  data: LeadRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

async function rawQuery(
  filters: ListLeadsQuery,
  user: AppUser,
  options: { unbounded?: boolean } = {},
) {
  const conds = [];

  if (user.perfil === "consultor") {
    conds.push(eq(leadsTable.consultorId, user.id));
  }
  if (filters.status) {
    conds.push(eq(leadsTable.status, filters.status as StatusLead));
  } else {
    // Esconde por default status terminais que poluem a lista. Cada categoria
    // tem seu próprio toggle nos filtros — replica comportamento do Notion.
    const escondidos: StatusLead[] = [];
    if (!filters.incluirEncerrados) {
      escondidos.push("perdido" as StatusLead);
      escondidos.push("desqualificado" as StatusLead);
    }
    if (!filters.incluirFechados) {
      escondidos.push("fechado" as StatusLead);
    }
    if (escondidos.length > 0) {
      conds.push(not(inArray(leadsTable.status, escondidos)));
    }
  }
  // "__none__" é sentinela do filtro pra leads sem consultor (pool não-
  // atribuído). Qualquer outro valor é tratado como UUID de consultor real.
  if (filters.consultorId === "__none__") {
    conds.push(isNull(leadsTable.consultorId));
  } else if (filters.consultorId) {
    conds.push(eq(leadsTable.consultorId, filters.consultorId));
  }
  // origem (legado) e source (canônico) são mirror — qualquer um filtra
  // a mesma coluna. UI atual envia ambos sincronizados pra retrocompat.
  if (filters.source) conds.push(eq(leadsTable.source, filters.source));
  else if (filters.origem) conds.push(eq(leadsTable.origem, filters.origem));
  // Channel é filtro independente: ou usado sozinho (todos sources daquele
  // canal) ou combinado com source pra restringir mais.
  if (filters.channel) conds.push(eq(leadsTable.channel, filters.channel));
  if (filters.estado) conds.push(eq(leadsTable.estado, filters.estado));
  if (filters.dispositivo) conds.push(eq(leadsTable.dispositivo, filters.dispositivo));
  if (filters.valorMin != null)
    conds.push(gte(leadsTable.valorCreditoCentavos, filters.valorMin));
  if (filters.valorMax != null)
    conds.push(lte(leadsTable.valorCreditoCentavos, filters.valorMax));
  if (filters.dataDe)
    conds.push(gte(leadsTable.createdAt, startOfDayBrt(filters.dataDe)));
  if (filters.dataAte)
    conds.push(lte(leadsTable.createdAt, endOfDayBrt(filters.dataAte)));
  if (filters.q) {
    const like = `%${filters.q}%`;
    // Marketing pode ENXERGAR PII mascarada, mas NÃO pode usar a busca pra
    // confirmar se um CPF/email/whatsapp existe (oracle de PII). Pra esse
    // perfil, busca casa apenas em `nome`.
    if (user.perfil === "marketing") {
      conds.push(ilike(leadsTable.nome, like));
    } else {
      conds.push(
        or(
          ilike(leadsTable.nome, like),
          ilike(leadsTable.email, like),
          ilike(leadsTable.cpf, like),
          ilike(leadsTable.whatsapp, like),
        ),
      );
    }
  }

  const where = conds.length > 0 ? and(...conds) : undefined;

  const baseQuery = db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      cpf: leadsTable.cpf,
      whatsapp: leadsTable.whatsapp,
      email: leadsTable.email,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      status: leadsTable.status,
      origem: leadsTable.origem,
      dispositivo: leadsTable.dispositivo,
      consultorId: leadsTable.consultorId,
      consultorNome: usersTable.nome,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      valorImovelCentavos: leadsTable.valorImovelCentavos,
      rendaMensalCentavos: leadsTable.rendaMensalCentavos,
      bancoAprovador: leadsTable.bancoAprovador,
      valorLiberadoCentavos: leadsTable.valorLiberadoCentavos,
      comissaoCentavos: leadsTable.comissaoCentavos,
      ultimoContato: leadsTable.ultimoContato,
      createdAt: leadsTable.createdAt,
      updatedAt: leadsTable.updatedAt,
    })
    .from(leadsTable)
    .leftJoin(usersTable, eq(usersTable.id, leadsTable.consultorId))
    .where(where)
    .orderBy(...orderingClause(filters));

  if (options.unbounded) {
    return await baseQuery.limit(500); // cap defensivo
  }

  const offset = (filters.page - 1) * filters.pageSize;
  return await baseQuery.limit(filters.pageSize).offset(offset);
}

export async function listLeads(
  filters: ListLeadsQuery,
  user: AppUser,
): Promise<ListLeadsResult> {
  const [rows, totals] = await Promise.all([
    rawQuery(filters, user),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(buildCountWhere(filters, user)),
  ]);
  const total = totals[0]?.total ?? 0;
  const slaSet = await activeSlaLeadIds(rows.map((r) => r.id));
  const data = rows.map((l) => ({
    ...maskLeadForPerfil(l, user.perfil),
    slaAtrasado: slaSet.has(l.id),
  })) as LeadRow[];
  return {
    data,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    },
  };
}

/** Para o Kanban: traz até 500 leads sem paginação, ordenados por created_at desc. */
export async function listLeadsForKanban(
  filters: ListLeadsQuery,
  user: AppUser,
): Promise<LeadRow[]> {
  const rows = await rawQuery(filters, user, { unbounded: true });
  const slaSet = await activeSlaLeadIds(rows.map((r) => r.id));
  return rows.map((l) => ({
    ...maskLeadForPerfil(l, user.perfil),
    slaAtrasado: slaSet.has(l.id),
  })) as LeadRow[];
}

function buildCountWhere(filters: ListLeadsQuery, user: AppUser) {
  const conds = [];
  if (user.perfil === "consultor") {
    conds.push(eq(leadsTable.consultorId, user.id));
  }
  if (filters.status) {
    conds.push(eq(leadsTable.status, filters.status as StatusLead));
  } else {
    // Esconde por default status terminais que poluem a lista. Cada categoria
    // tem seu próprio toggle nos filtros — replica comportamento do Notion.
    const escondidos: StatusLead[] = [];
    if (!filters.incluirEncerrados) {
      escondidos.push("perdido" as StatusLead);
      escondidos.push("desqualificado" as StatusLead);
    }
    if (!filters.incluirFechados) {
      escondidos.push("fechado" as StatusLead);
    }
    if (escondidos.length > 0) {
      conds.push(not(inArray(leadsTable.status, escondidos)));
    }
  }
  // "__none__" é sentinela do filtro pra leads sem consultor (pool não-
  // atribuído). Qualquer outro valor é tratado como UUID de consultor real.
  if (filters.consultorId === "__none__") {
    conds.push(isNull(leadsTable.consultorId));
  } else if (filters.consultorId) {
    conds.push(eq(leadsTable.consultorId, filters.consultorId));
  }
  // origem (legado) e source (canônico) são mirror — qualquer um filtra
  // a mesma coluna. UI atual envia ambos sincronizados pra retrocompat.
  if (filters.source) conds.push(eq(leadsTable.source, filters.source));
  else if (filters.origem) conds.push(eq(leadsTable.origem, filters.origem));
  // Channel é filtro independente: ou usado sozinho (todos sources daquele
  // canal) ou combinado com source pra restringir mais.
  if (filters.channel) conds.push(eq(leadsTable.channel, filters.channel));
  if (filters.estado) conds.push(eq(leadsTable.estado, filters.estado));
  if (filters.dispositivo) conds.push(eq(leadsTable.dispositivo, filters.dispositivo));
  if (filters.valorMin != null)
    conds.push(gte(leadsTable.valorCreditoCentavos, filters.valorMin));
  if (filters.valorMax != null)
    conds.push(lte(leadsTable.valorCreditoCentavos, filters.valorMax));
  if (filters.dataDe)
    conds.push(gte(leadsTable.createdAt, startOfDayBrt(filters.dataDe)));
  if (filters.dataAte)
    conds.push(lte(leadsTable.createdAt, endOfDayBrt(filters.dataAte)));
  if (filters.q) {
    const like = `%${filters.q}%`;
    // Marketing pode ENXERGAR PII mascarada, mas NÃO pode usar a busca pra
    // confirmar se um CPF/email/whatsapp existe (oracle de PII). Pra esse
    // perfil, busca casa apenas em `nome`.
    if (user.perfil === "marketing") {
      conds.push(ilike(leadsTable.nome, like));
    } else {
      conds.push(
        or(
          ilike(leadsTable.nome, like),
          ilike(leadsTable.email, like),
          ilike(leadsTable.cpf, like),
          ilike(leadsTable.whatsapp, like),
        ),
      );
    }
  }
  return conds.length > 0 ? and(...conds) : undefined;
}

/** Lista de consultores ativos (para filtros e selects). */
export async function listConsultoresAtivos() {
  return await db
    .select({
      id: usersTable.id,
      nome: usersTable.nome,
      perfil: usersTable.perfil,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.ativo, true),
        inArray(usersTable.perfil, ["admin", "gerente", "consultor"]),
      ),
    )
    .orderBy(usersTable.nome);
}

/** Origens distintas usadas em algum lead, pra alimentar filtro. */
export async function listOrigensDistintas() {
  const rows = await db
    .selectDistinct({ origem: leadsTable.origem })
    .from(leadsTable);
  return rows.map((r) => r.origem).filter((o): o is string => Boolean(o)).sort();
}
