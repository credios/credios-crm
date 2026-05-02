import { and, eq, gte, lte, notInArray, sql } from "drizzle-orm";

import { leads, users as usersTable } from "../../../db/schema";
import { db } from "@/lib/db";
import type { ReportFilters } from "@/lib/validators/report";

import type { PeriodRange } from "./period";

function baseConds(filters: ReportFilters) {
  const c = [];
  if (filters.consultorId) c.push(eq(leads.consultorId, filters.consultorId));
  if (filters.origem) c.push(eq(leads.origem, filters.origem));
  return c;
}

// ============================================================================
// KPIs
// ============================================================================

export type Kpis = {
  leadsNovosCount: number;
  pipelineCount: number;
  pipelineValorCentavos: number;
  fechadosCount: number;
  fechadosValorLiberadoCentavos: number;
  fechadosComissaoCentavos: number;
  conversaoRolling90d: { criados: number; fechados: number; taxa: number };
};

export async function fetchKpis(filters: ReportFilters, period: PeriodRange): Promise<Kpis> {
  const cb = baseConds(filters);

  const [novosRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        gte(leads.createdAt, period.from),
        lte(leads.createdAt, period.to),
        ...cb,
      ),
    );

  const [pipelineRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      valor: sql<string>`coalesce(sum(${leads.valorCreditoCentavos}), 0)::text`,
    })
    .from(leads)
    .where(
      and(
        notInArray(
          leads.status,
          ["fechado", "perdido", "desqualificado", "sem_resposta"],
        ),
        ...cb,
      ),
    );

  const [fechadosRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      valorLiberado: sql<string>`coalesce(sum(${leads.valorLiberadoCentavos}), 0)::text`,
      comissao: sql<string>`coalesce(sum(${leads.comissaoCentavos}), 0)::text`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.status, "fechado"),
        sql`${leads.dataFechamento} >= ${period.from.toISOString().slice(0, 10)}::date`,
        sql`${leads.dataFechamento} <= ${period.to.toISOString().slice(0, 10)}::date`,
        ...cb,
      ),
    );

  // Conversão rolling 90d (sem filtros de período custom — sempre últimos 90d)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [criadosRollRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(gte(leads.createdAt, ninetyDaysAgo), ...cb));
  const [fechadosRollRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        eq(leads.status, "fechado"),
        gte(leads.createdAt, ninetyDaysAgo),
        ...cb,
      ),
    );
  const taxa =
    criadosRollRow.count > 0 ? fechadosRollRow.count / criadosRollRow.count : 0;

  return {
    leadsNovosCount: novosRow.count,
    pipelineCount: pipelineRow.count,
    pipelineValorCentavos: Number(pipelineRow.valor ?? 0),
    fechadosCount: fechadosRow.count,
    fechadosValorLiberadoCentavos: Number(fechadosRow.valorLiberado ?? 0),
    fechadosComissaoCentavos: Number(fechadosRow.comissao ?? 0),
    conversaoRolling90d: {
      criados: criadosRollRow.count,
      fechados: fechadosRollRow.count,
      taxa,
    },
  };
}

// ============================================================================
// Volume por dia (linha + área empilhada por origem)
// ============================================================================

export type VolumePorDiaRow = { dia: string; origem: string; count: number };

export async function fetchVolumePorDia(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<VolumePorDiaRow[]> {
  const cb = baseConds(filters);
  const rows = await db
    .select({
      dia: sql<string>`to_char(date_trunc('day', ${leads.createdAt}), 'YYYY-MM-DD')`,
      origem: sql<string>`coalesce(${leads.origem}, 'Sem origem')`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(
        gte(leads.createdAt, period.from),
        lte(leads.createdAt, period.to),
        ...cb,
      ),
    )
    .groupBy(
      sql`date_trunc('day', ${leads.createdAt})`,
      sql`coalesce(${leads.origem}, 'Sem origem')`,
    )
    .orderBy(sql`date_trunc('day', ${leads.createdAt})`);
  return rows.map((r) => ({
    dia: String(r.dia),
    origem: String(r.origem),
    count: Number(r.count),
  }));
}

// ============================================================================
// Funil de conversão (count por status no snapshot atual, scoped por filtros)
// ============================================================================

export type FunilRow = { status: string; count: number };

export async function fetchFunil(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<FunilRow[]> {
  const cb = baseConds(filters);
  const rows = await db
    .select({
      status: leads.status,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(
        gte(leads.createdAt, period.from),
        lte(leads.createdAt, period.to),
        ...cb,
      ),
    )
    .groupBy(leads.status);
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

// ============================================================================
// Tempo médio em cada status (horas)
// ============================================================================

export type TempoMedioRow = { status: string; horasMedias: number; transicoes: number };

export async function fetchTempoMedioPorStatus(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<TempoMedioRow[]> {
  // Window function: pra cada interação tipo='mudanca_status', a duração no
  // status anterior = current.criado_em - LAG(criado_em).
  // Se primeira mudança, fallback pra leads.created_at.
  const cb: string[] = [];
  if (filters.consultorId) cb.push(`l.consultor_id = '${filters.consultorId}'`);
  if (filters.origem) cb.push(`l.origem = '${filters.origem.replace(/'/g, "''")}'`);
  const extra = cb.length > 0 ? `AND ${cb.join(" AND ")}` : "";

  const result = await db.execute<{
    status: string;
    horas_medias: string;
    transicoes: string;
  }>(sql.raw(`
    WITH events AS (
      SELECT
        i.lead_id,
        i.metadata->>'de' AS from_status,
        i.criado_em,
        l.created_at AS lead_created_at
      FROM public.interacoes i
      JOIN public.leads l ON l.id = i.lead_id
      WHERE i.tipo = 'mudanca_status'
        AND l.created_at >= '${period.from.toISOString()}'
        AND l.created_at <= '${period.to.toISOString()}'
        ${extra}
    ),
    transitions AS (
      SELECT
        from_status,
        criado_em,
        lead_created_at,
        LAG(criado_em) OVER (PARTITION BY lead_id ORDER BY criado_em) AS prev_change_at
      FROM events
    )
    SELECT
      from_status AS status,
      AVG(EXTRACT(EPOCH FROM (criado_em - COALESCE(prev_change_at, lead_created_at))) / 3600.0) AS horas_medias,
      COUNT(*) AS transicoes
    FROM transitions
    WHERE from_status IS NOT NULL
    GROUP BY from_status
    ORDER BY horas_medias DESC
  `));
  return result.map((r) => ({
    status: String(r.status),
    horasMedias: Number(r.horas_medias ?? 0),
    transicoes: Number(r.transicoes ?? 0),
  }));
}

// ============================================================================
// Performance por consultor
// ============================================================================

export type PerformanceConsultorRow = {
  consultorId: string;
  consultorNome: string;
  leadsAtribuidos: number;
  fechados: number;
  taxaFechamento: number;
  primeiroContatoMinAvg: number | null;
};

export async function fetchPerformanceConsultores(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<PerformanceConsultorRow[]> {
  const consConds: string[] = [];
  if (filters.origem) consConds.push(`l.origem = '${filters.origem.replace(/'/g, "''")}'`);
  if (filters.consultorId) consConds.push(`u.id = '${filters.consultorId}'`);
  const extra = consConds.length > 0 ? `AND ${consConds.join(" AND ")}` : "";

  const result = await db.execute<{
    consultor_id: string;
    consultor_nome: string;
    leads_atribuidos: string;
    fechados: string;
    primeiro_contato_min_avg: string | null;
  }>(sql.raw(`
    SELECT
      u.id AS consultor_id,
      u.nome AS consultor_nome,
      COUNT(DISTINCT l.id) AS leads_atribuidos,
      COUNT(DISTINCT CASE WHEN l.status = 'fechado' THEN l.id END) AS fechados,
      AVG(pc.minutos) AS primeiro_contato_min_avg
    FROM public.users u
    LEFT JOIN public.leads l ON l.consultor_id = u.id
      AND l.atribuido_em >= '${period.from.toISOString()}'
      AND l.atribuido_em <= '${period.to.toISOString()}'
      ${extra}
    LEFT JOIN LATERAL (
      SELECT EXTRACT(EPOCH FROM (MIN(i.criado_em) - l.atribuido_em)) / 60.0 AS minutos
      FROM public.interacoes i
      WHERE i.lead_id = l.id
        AND i.tipo NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema')
    ) pc ON true
    WHERE u.perfil IN ('admin', 'gerente', 'consultor')
      AND u.ativo = true
    GROUP BY u.id, u.nome
    ORDER BY leads_atribuidos DESC, u.nome
  `));

  return result.map((r) => {
    const atribuidos = Number(r.leads_atribuidos ?? 0);
    const fechados = Number(r.fechados ?? 0);
    return {
      consultorId: r.consultor_id,
      consultorNome: r.consultor_nome,
      leadsAtribuidos: atribuidos,
      fechados,
      taxaFechamento: atribuidos > 0 ? fechados / atribuidos : 0,
      primeiroContatoMinAvg:
        r.primeiro_contato_min_avg != null ? Number(r.primeiro_contato_min_avg) : null,
    };
  });
}

// ============================================================================
// Pipeline ativo por status (donut)
// ============================================================================

export type PipelineRow = { status: string; count: number; valorCentavos: number };

export async function fetchPipelineAtivoPorStatus(
  filters: ReportFilters,
): Promise<PipelineRow[]> {
  const cb = baseConds(filters);
  const rows = await db
    .select({
      status: leads.status,
      count: sql<number>`count(*)::int`,
      valor: sql<string>`coalesce(sum(${leads.valorCreditoCentavos}), 0)::text`,
    })
    .from(leads)
    .where(
      and(
        notInArray(leads.status, ["fechado", "perdido", "desqualificado", "sem_resposta"]),
        ...cb,
      ),
    )
    .groupBy(leads.status);
  return rows.map((r) => ({
    status: r.status,
    count: Number(r.count),
    valorCentavos: Number(r.valor ?? 0),
  }));
}

// ============================================================================
// Receita realizada por mês (últimos 12 meses)
// ============================================================================

export type ReceitaMensalRow = {
  mes: string; // YYYY-MM
  comissaoCentavos: number;
  valorLiberadoCentavos: number;
  fechadosCount: number;
};

export async function fetchReceitaMensal(
  filters: ReportFilters,
): Promise<ReceitaMensalRow[]> {
  const cb = baseConds(filters);
  const rows = await db
    .select({
      mes: sql<string>`to_char(date_trunc('month', ${leads.dataFechamento}), 'YYYY-MM')`,
      comissao: sql<string>`coalesce(sum(${leads.comissaoCentavos}), 0)::text`,
      valorLiberado: sql<string>`coalesce(sum(${leads.valorLiberadoCentavos}), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.status, "fechado"),
        sql`${leads.dataFechamento} >= (NOW() - INTERVAL '12 months')::date`,
        ...cb,
      ),
    )
    .groupBy(sql`date_trunc('month', ${leads.dataFechamento})`)
    .orderBy(sql`date_trunc('month', ${leads.dataFechamento})`);
  return rows.map((r) => ({
    mes: String(r.mes),
    comissaoCentavos: Number(r.comissao ?? 0),
    valorLiberadoCentavos: Number(r.valorLiberado ?? 0),
    fechadosCount: Number(r.count),
  }));
}

// ============================================================================
// Lookups: consultores e origens (pra alimentar filtros)
// ============================================================================

export async function fetchConsultoresAtivos() {
  return await db
    .select({ id: usersTable.id, nome: usersTable.nome })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.ativo, true),
        sql`${usersTable.perfil} IN ('admin','gerente','consultor')`,
      ),
    )
    .orderBy(usersTable.nome);
}

export async function fetchOrigensDistintas() {
  const rows = await db
    .selectDistinct({ origem: leads.origem })
    .from(leads);
  return rows
    .map((r) => r.origem)
    .filter((o): o is string => Boolean(o))
    .sort();
}
