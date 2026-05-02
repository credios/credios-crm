import "server-only";

import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  leads as leadsTable,
  slaAlertas,
  users as usersTable,
} from "../../../db/schema";
import { type AppUser } from "@/lib/auth/get-app-user";
import { maskLeadForPerfil } from "@/lib/auth/mascaramento";
import { db } from "@/lib/db";
import type { ListLeadsQuery, StatusLead } from "@/lib/validators/lead";

export type LeadRow = Awaited<ReturnType<typeof rawQuery>>[number] & {
  rendaFaixa?: string | null;
  /** True se há SLA `primeiro_contato_atrasado` ativo (resolvido_em IS NULL). */
  slaAtrasado?: boolean;
};

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
  if (filters.status) conds.push(eq(leadsTable.status, filters.status as StatusLead));
  if (filters.consultorId) conds.push(eq(leadsTable.consultorId, filters.consultorId));
  if (filters.origem) conds.push(eq(leadsTable.origem, filters.origem));
  if (filters.estado) conds.push(eq(leadsTable.estado, filters.estado));
  if (filters.dispositivo) conds.push(eq(leadsTable.dispositivo, filters.dispositivo));
  if (filters.valorMin != null)
    conds.push(gte(leadsTable.valorCreditoCentavos, filters.valorMin));
  if (filters.valorMax != null)
    conds.push(lte(leadsTable.valorCreditoCentavos, filters.valorMax));
  if (filters.dataDe)
    conds.push(gte(leadsTable.createdAt, new Date(`${filters.dataDe}T00:00:00Z`)));
  if (filters.dataAte)
    conds.push(lte(leadsTable.createdAt, new Date(`${filters.dataAte}T23:59:59Z`)));
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      or(
        ilike(leadsTable.nome, like),
        ilike(leadsTable.email, like),
        ilike(leadsTable.cpf, like),
        ilike(leadsTable.whatsapp, like),
      ),
    );
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
    .orderBy(desc(leadsTable.createdAt));

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
  if (filters.status) conds.push(eq(leadsTable.status, filters.status as StatusLead));
  if (filters.consultorId) conds.push(eq(leadsTable.consultorId, filters.consultorId));
  if (filters.origem) conds.push(eq(leadsTable.origem, filters.origem));
  if (filters.estado) conds.push(eq(leadsTable.estado, filters.estado));
  if (filters.dispositivo) conds.push(eq(leadsTable.dispositivo, filters.dispositivo));
  if (filters.valorMin != null)
    conds.push(gte(leadsTable.valorCreditoCentavos, filters.valorMin));
  if (filters.valorMax != null)
    conds.push(lte(leadsTable.valorCreditoCentavos, filters.valorMax));
  if (filters.dataDe)
    conds.push(gte(leadsTable.createdAt, new Date(`${filters.dataDe}T00:00:00Z`)));
  if (filters.dataAte)
    conds.push(lte(leadsTable.createdAt, new Date(`${filters.dataAte}T23:59:59Z`)));
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      or(
        ilike(leadsTable.nome, like),
        ilike(leadsTable.email, like),
        ilike(leadsTable.cpf, like),
        ilike(leadsTable.whatsapp, like),
      ),
    );
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
