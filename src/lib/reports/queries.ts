import { and, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { leads, users as usersTable } from "../../../db/schema";
import { mvFechadosDiarios, mvLeadsDiarios } from "../../../db/views";
import { db } from "@/lib/db";
import {
  normalizeFilters,
  type ReportFilters,
} from "@/lib/validators/report";

import type { PeriodRange } from "./period";

// Filtro por faixa de valor (valorMinCentavos / valorMaxCentavos) é
// granular ao lead — não dá pra aplicar em rows da MV (que já são agregados).
// Quando esse filtro está ativo, voltamos pra leitura direta da tabela
// leads (com cache normal). Casos comuns (sem filter de valor) servem
// das MVs em ms.
function canUseMV(filters: ReportFilters): boolean {
  return filters.valorMinCentavos == null && filters.valorMaxCentavos == null;
}

// Conditions pra mvLeadsDiarios — converte filtros pros campos da MV
// (que tem COALESCE em origem/estado/consultor pra evitar NULLs).
function mvLeadsConds(filters: ReportFilters) {
  const f = normalizeFilters(filters);
  const c = [];
  if (f.consultorIds.length === 1) {
    c.push(eq(mvLeadsDiarios.consultorId, f.consultorIds[0]!));
  } else if (f.consultorIds.length > 1) {
    c.push(inArray(mvLeadsDiarios.consultorId, f.consultorIds));
  }
  if (f.origens.length === 1) {
    c.push(eq(mvLeadsDiarios.origem, f.origens[0]!));
  } else if (f.origens.length > 1) {
    c.push(inArray(mvLeadsDiarios.origem, f.origens));
  }
  if (f.ufs.length === 1) {
    c.push(eq(mvLeadsDiarios.estado, f.ufs[0]!));
  } else if (f.ufs.length > 1) {
    c.push(inArray(mvLeadsDiarios.estado, f.ufs));
  }
  return c;
}

function mvFechadosConds(filters: ReportFilters) {
  const f = normalizeFilters(filters);
  const c = [];
  if (f.consultorIds.length === 1) {
    c.push(eq(mvFechadosDiarios.consultorId, f.consultorIds[0]!));
  } else if (f.consultorIds.length > 1) {
    c.push(inArray(mvFechadosDiarios.consultorId, f.consultorIds));
  }
  if (f.origens.length === 1) {
    c.push(eq(mvFechadosDiarios.origem, f.origens[0]!));
  } else if (f.origens.length > 1) {
    c.push(inArray(mvFechadosDiarios.origem, f.origens));
  }
  if (f.ufs.length === 1) {
    c.push(eq(mvFechadosDiarios.estado, f.ufs[0]!));
  } else if (f.ufs.length > 1) {
    c.push(inArray(mvFechadosDiarios.estado, f.ufs));
  }
  return c;
}

// Helper pra gerar chaves de cache determinísticas a partir de
// (filters, period). Evita explosões de cache por ordem de keys do filter
// e por timestamps com microssegundos diferentes.
//
// CRÍTICO: presets como "30d", "7d", "90d" usam `to: now` em periodFromFilters,
// que muda a cada millisegundo. Sem truncar, a chave de cache varia em toda
// request → cache NUNCA HIT → toda request paga o custo total das queries.
// Truncamos pra hora (slice(0, 13) = "YYYY-MM-DDTHH") — estável dentro de
// cada hora, balanceando cache hits com freshness razoável.
function bucketHour(d: Date): string {
  return d.toISOString().slice(0, 13);
}

function cacheKeyFor(
  prefix: string,
  filters: ReportFilters,
  period?: PeriodRange,
): string[] {
  const f = normalizeFilters(filters);
  const parts = [
    prefix,
    f.consultorIds.slice().sort().join(","),
    f.origens.slice().sort().join(","),
    f.ufs.slice().sort().join(","),
    String(f.valorMinCentavos ?? ""),
    String(f.valorMaxCentavos ?? ""),
  ];
  if (period) {
    parts.push(bucketHour(period.from), bucketHour(period.to));
  }
  return parts;
}

// TTL padrão pra queries pesadas dos dashboards: 2 min. Equilibra freshness
// (relatórios não precisam ser real-time) com performance (primeira request
// paga o custo, demais nesse minuto vêm do Data Cache).
const REPORT_CACHE_TTL = 120;

function baseConds(rawFilters: ReportFilters) {
  const filters = normalizeFilters(rawFilters);
  const c = [];
  if (filters.consultorIds.length === 1) {
    c.push(eq(leads.consultorId, filters.consultorIds[0]!));
  } else if (filters.consultorIds.length > 1) {
    c.push(inArray(leads.consultorId, filters.consultorIds));
  }
  if (filters.origens.length === 1) {
    c.push(eq(leads.origem, filters.origens[0]!));
  } else if (filters.origens.length > 1) {
    c.push(inArray(leads.origem, filters.origens));
  }
  if (filters.ufs.length === 1) {
    c.push(eq(leads.estado, filters.ufs[0]!));
  } else if (filters.ufs.length > 1) {
    c.push(inArray(leads.estado, filters.ufs));
  }
  if (filters.valorMinCentavos != null) {
    c.push(gte(leads.valorCreditoCentavos, filters.valorMinCentavos));
  }
  if (filters.valorMaxCentavos != null) {
    c.push(lte(leads.valorCreditoCentavos, filters.valorMaxCentavos));
  }
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

// 2 camadas de cache:
//   - React.cache() deduplica por REQUEST (KpisSection + SaudeOperacionalSection
//     chamam com mesmos args dentro do mesmo render → 1 execução só).
//   - unstable_cache() persiste por TTL=120s entre requests diferentes.
// Resultado: primeira request paga, demais nesse minuto vêm em ms.
export const fetchKpis = cache(async function fetchKpis(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<Kpis> {
  return unstable_cache(
    () => fetchKpisUncached(filters, period),
    cacheKeyFor("reports:kpis", filters, period),
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
});

async function fetchKpisUncached(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<Kpis> {
  if (canUseMV(filters)) {
    return fetchKpisFromMV(filters, period);
  }
  return fetchKpisFromTable(filters, period);
}

async function fetchKpisFromMV(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<Kpis> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const fromDateStr = period.from.toISOString().slice(0, 10);
  const toDateStr = period.to.toISOString().slice(0, 10);
  const ninetyAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);
  const cbLeads = mvLeadsConds(filters);
  const cbFechados = mvFechadosConds(filters);

  const [
    [novosRow],
    [pipelineRow],
    [fechadosRow],
    [criadosRollRow],
    [fechadosRollRow],
  ] = await Promise.all([
    db
      .select({ count: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int` })
      .from(mvLeadsDiarios)
      .where(
        and(
          gte(mvLeadsDiarios.diaCriacao, fromDateStr),
          lte(mvLeadsDiarios.diaCriacao, toDateStr),
          ...cbLeads,
        ),
      ),
    db
      .select({
        count: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int`,
        valor: sql<string>`coalesce(sum(${mvLeadsDiarios.somaValorCredito}), 0)::text`,
      })
      .from(mvLeadsDiarios)
      .where(
        and(
          notInArray(mvLeadsDiarios.status, [
            "fechado",
            "perdido",
            "desqualificado",
          ]),
          ...cbLeads,
        ),
      ),
    db
      .select({
        count: sql<number>`coalesce(sum(${mvFechadosDiarios.qtd}), 0)::int`,
        valorLiberado: sql<string>`coalesce(sum(${mvFechadosDiarios.somaValorLiberado}), 0)::text`,
        comissao: sql<string>`coalesce(sum(${mvFechadosDiarios.somaComissao}), 0)::text`,
      })
      .from(mvFechadosDiarios)
      .where(
        and(
          gte(mvFechadosDiarios.diaFechamento, fromDateStr),
          lte(mvFechadosDiarios.diaFechamento, toDateStr),
          ...cbFechados,
        ),
      ),
    db
      .select({ count: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int` })
      .from(mvLeadsDiarios)
      .where(
        and(gte(mvLeadsDiarios.diaCriacao, ninetyAgoStr), ...cbLeads),
      ),
    db
      .select({ count: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int` })
      .from(mvLeadsDiarios)
      .where(
        and(
          eq(mvLeadsDiarios.status, "fechado"),
          gte(mvLeadsDiarios.diaCriacao, ninetyAgoStr),
          ...cbLeads,
        ),
      ),
  ]);

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

// Fallback pra leitura direta da tabela leads — usado quando filter de
// valor está ativo (granular ao lead, não cabe em agregado da MV).
async function fetchKpisFromTable(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<Kpis> {
  const cb = baseConds(filters);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const fromDate = period.from.toISOString().slice(0, 10);
  const toDate = period.to.toISOString().slice(0, 10);

  // 5 queries em PARALELO (antes eram sequenciais — 5x latência). Com pool=10
  // do pg-js sobre pgbouncer, todas pegam conexões simultaneamente.
  const [
    [novosRow],
    [pipelineRow],
    [fechadosRow],
    [criadosRollRow],
    [fechadosRollRow],
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          gte(leads.createdAt, period.from),
          lte(leads.createdAt, period.to),
          ...cb,
        ),
      ),
    db
      .select({
        count: sql<number>`count(*)::int`,
        valor: sql<string>`coalesce(sum(${leads.valorCreditoCentavos}), 0)::text`,
      })
      .from(leads)
      .where(
        and(
          notInArray(
            leads.status,
            ["fechado", "perdido", "desqualificado"],
          ),
          ...cb,
        ),
      ),
    db
      .select({
        count: sql<number>`count(*)::int`,
        valorLiberado: sql<string>`coalesce(sum(${leads.valorLiberadoCentavos}), 0)::text`,
        comissao: sql<string>`coalesce(sum(${leads.comissaoCentavos}), 0)::text`,
      })
      .from(leads)
      .where(
        and(
          eq(leads.status, "fechado"),
          sql`${leads.dataFechamento} >= ${fromDate}::date`,
          sql`${leads.dataFechamento} <= ${toDate}::date`,
          ...cb,
        ),
      ),
    // Conversão rolling 90d (sem filtros de período custom — sempre últimos 90d)
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(gte(leads.createdAt, ninetyDaysAgo), ...cb)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          eq(leads.status, "fechado"),
          gte(leads.createdAt, ninetyDaysAgo),
          ...cb,
        ),
      ),
  ]);

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
// Volume por dia (barras empilhadas por CANAL)
// ============================================================================
// Agrupado por `channel` (12 categorias estáveis) em vez de `origem`/`source`
// (40+ que crescem). Reduz drasticamente a poluição visual da legenda e
// alinha com a taxonomia GA4-style introduzida na migration 0017.
//
// Retorna granularidade dia × channel × desqualificado(bool). Cliente
// agrega/filtra sob demanda — toggle de "esconder desqualificados" e
// filtro de canal aplicados no client, sem novo roundtrip pro server.
// Cache do unstable_cache(filters) preserva hit independente de toggles.
//
// MV (mv_leads_diarios) não inclui `channel` — usamos query direta na
// `leads`. Volume atual (~hundreds/mês) não exige otimização. Quando
// crescer, refazer a MV adicionando a coluna.

export type VolumePorDiaRow = {
  dia: string;
  channel: string;
  /** Lead foi desqualificado depois da criação. Cliente filtra com base nisso. */
  desqualificado: boolean;
  count: number;
};

export async function fetchVolumePorDia(
  _filters: ReportFilters,
  period: PeriodRange,
): Promise<VolumePorDiaRow[]> {
  // Note: filters.canal e filters.excluirDesq NÃO entram no WHERE — cliente
  // aplica visualmente. Mantém URL bookmarkable + UX fluida sem cache miss.
  const filters = _filters;

  const rows = await db
    .select({
      dia: sql<string>`to_char(date_trunc('day', ${leads.createdAt}), 'YYYY-MM-DD')`,
      channel: sql<string>`coalesce(${leads.channel}, 'Sem canal')`,
      desqualificado: sql<boolean>`${leads.status} = 'desqualificado'`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(
        gte(leads.createdAt, period.from),
        lte(leads.createdAt, period.to),
        ...baseConds(filters),
      ),
    )
    .groupBy(
      sql`date_trunc('day', ${leads.createdAt})`,
      sql`coalesce(${leads.channel}, 'Sem canal')`,
      sql`${leads.status} = 'desqualificado'`,
    )
    .orderBy(sql`date_trunc('day', ${leads.createdAt})`);

  // Defensivo: filtra/sanitiza tipos inesperados do postgres-js.
  return rows
    .map((r) => {
      const count = Number(r.count);
      const dia = typeof r.dia === "string" && r.dia.length === 10 ? r.dia : null;
      const channel =
        typeof r.channel === "string" && r.channel.length > 0
          ? r.channel
          : "Sem canal";
      const desqualificado = Boolean(r.desqualificado);
      return { dia, channel, desqualificado, count };
    })
    .filter(
      (r): r is { dia: string; channel: string; desqualificado: boolean; count: number } =>
        r.dia !== null && Number.isFinite(r.count),
    );
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
  rawFilters: ReportFilters,
  period: PeriodRange,
): Promise<TempoMedioRow[]> {
  return unstable_cache(
    () => fetchTempoMedioPorStatusUncached(rawFilters, period),
    cacheKeyFor("reports:tempo-medio-status", rawFilters, period),
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
}

async function fetchTempoMedioPorStatusUncached(
  rawFilters: ReportFilters,
  period: PeriodRange,
): Promise<TempoMedioRow[]> {
  const filters = normalizeFilters(rawFilters);
  // Window function: pra cada interação tipo='mudanca_status', a duração no
  // status anterior = current.criado_em - LAG(criado_em).
  // Se primeira mudança, fallback pra leads.created_at.
  const cb: string[] = [];
  if (filters.consultorIds.length > 0) {
    const list = filters.consultorIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");
    cb.push(`l.consultor_id IN (${list})`);
  }
  if (filters.origens.length > 0) {
    const list = filters.origens
      .map((o) => `'${o.replace(/'/g, "''")}'`)
      .join(",");
    cb.push(`l.origem IN (${list})`);
  }
  if (filters.ufs.length > 0) {
    const list = filters.ufs.map((uf) => `'${uf.replace(/'/g, "''")}'`).join(",");
    cb.push(`l.estado IN (${list})`);
  }
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
  rawFilters: ReportFilters,
  period: PeriodRange,
): Promise<PerformanceConsultorRow[]> {
  const filters = normalizeFilters(rawFilters);
  const consConds: string[] = [];
  if (filters.origens.length > 0) {
    const list = filters.origens
      .map((o) => `'${o.replace(/'/g, "''")}'`)
      .join(",");
    consConds.push(`l.origem IN (${list})`);
  }
  if (filters.consultorIds.length > 0) {
    const list = filters.consultorIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");
    consConds.push(`u.id IN (${list})`);
  }
  if (filters.ufs.length > 0) {
    const list = filters.ufs.map((uf) => `'${uf.replace(/'/g, "''")}'`).join(",");
    consConds.push(`l.estado IN (${list})`);
  }
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
      -- ORDER BY + LIMIT 1 ao invés de MIN() aggregate: com o índice parcial
      -- idx_interacoes_manuais_lead (lead_id, criado_em DESC), Postgres faz
      -- 1 index seek por lead em vez de scanear todas as interações.
      SELECT EXTRACT(EPOCH FROM (i.criado_em - l.atribuido_em)) / 60.0 AS minutos
      FROM public.interacoes i
      WHERE i.lead_id = l.id
        AND i.criado_em >= l.atribuido_em
        AND i.tipo NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema')
      ORDER BY i.criado_em ASC
      LIMIT 1
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
  const useMV = canUseMV(filters);
  const rows = useMV
    ? await db
        .select({
          status: mvLeadsDiarios.status,
          count: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int`,
          valor: sql<string>`coalesce(sum(${mvLeadsDiarios.somaValorCredito}), 0)::text`,
        })
        .from(mvLeadsDiarios)
        .where(
          and(
            notInArray(mvLeadsDiarios.status, [
              "fechado",
              "perdido",
              "desqualificado",
            ]),
            ...mvLeadsConds(filters),
          ),
        )
        .groupBy(mvLeadsDiarios.status)
    : await db
        .select({
          status: leads.status,
          count: sql<number>`count(*)::int`,
          valor: sql<string>`coalesce(sum(${leads.valorCreditoCentavos}), 0)::text`,
        })
        .from(leads)
        .where(
          and(
            notInArray(leads.status, [
              "fechado",
              "perdido",
              "desqualificado",
            ]),
            ...baseConds(filters),
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
  return unstable_cache(
    () => fetchReceitaMensalUncached(filters),
    cacheKeyFor("reports:receita-mensal", filters),
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
}

async function fetchReceitaMensalUncached(
  filters: ReportFilters,
): Promise<ReceitaMensalRow[]> {
  const useMV = canUseMV(filters);
  const rows = useMV
    ? await db
        .select({
          mes: sql<string>`to_char(date_trunc('month', ${mvFechadosDiarios.diaFechamento}), 'YYYY-MM')`,
          comissao: sql<string>`coalesce(sum(${mvFechadosDiarios.somaComissao}), 0)::text`,
          valorLiberado: sql<string>`coalesce(sum(${mvFechadosDiarios.somaValorLiberado}), 0)::text`,
          count: sql<number>`coalesce(sum(${mvFechadosDiarios.qtd}), 0)::int`,
        })
        .from(mvFechadosDiarios)
        .where(
          and(
            sql`${mvFechadosDiarios.diaFechamento} >= (NOW() - INTERVAL '12 months')::date`,
            ...mvFechadosConds(filters),
          ),
        )
        .groupBy(sql`date_trunc('month', ${mvFechadosDiarios.diaFechamento})`)
        .orderBy(sql`date_trunc('month', ${mvFechadosDiarios.diaFechamento})`)
    : await db
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
            ...baseConds(filters),
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

// Listas pra dropdowns dos filtros: lookups quase estáticos. Cacheados por
// 5 min globalmente (unstable_cache) — economizam SELECT DISTINCT em leads
// inteira em cada page load. Invalidação implícita por TTL.
export const fetchConsultoresAtivos = unstable_cache(
  async () => {
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
  },
  ["reports:consultores-ativos"],
  { revalidate: 300, tags: ["reports:lookups"] },
);

export const fetchOrigensDistintas = unstable_cache(
  async () => {
    const rows = await db
      .selectDistinct({ origem: leads.origem })
      .from(leads);
    return rows
      .map((r) => r.origem)
      .filter((o): o is string => Boolean(o))
      .sort();
  },
  ["reports:origens-distintas"],
  { revalidate: 300, tags: ["reports:lookups"] },
);

// ============================================================================
// Sales metrics (avg deal size, avg sales cycle, sales velocity, win rate)
// ============================================================================

export type SalesMetrics = {
  avgDealSizeCentavos: number;
  avgSalesCycleDays: number | null;
  salesVelocityCentavosPerDay: number;
  winRate: number; // 0..1 (no período)
  avgComissaoCentavos: number;
};

export async function fetchSalesMetrics(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<SalesMetrics> {
  return unstable_cache(
    () => fetchSalesMetricsUncached(filters, period),
    cacheKeyFor("reports:sales-metrics", filters, period),
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
}

async function fetchSalesMetricsUncached(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<SalesMetrics> {
  const fromIso = period.from.toISOString().slice(0, 10);
  const toIso = period.to.toISOString().slice(0, 10);
  const useMV = canUseMV(filters);

  // 4 queries em PARALELO. Quando useMV: lê de mv_fechados_diarios (avg) e
  // mv_leads_diarios (winRate / pipeline). Senão: tabela leads original.
  const [[avgRow], [resolvedRow], [wonRow], [pipelineRow]] = await Promise.all(
    useMV
      ? [
          // Avg deal size + comissão + ciclo (médias ponderadas via MV).
          db
            .select({
              avgValor: sql<string>`(coalesce(sum(${mvFechadosDiarios.somaValorLiberado}), 0)::numeric / nullif(sum(${mvFechadosDiarios.qtd}), 0))::text`,
              avgComissao: sql<string>`(coalesce(sum(${mvFechadosDiarios.somaComissao}), 0)::numeric / nullif(sum(${mvFechadosDiarios.qtd}), 0))::text`,
              avgCycle: sql<string | null>`(sum(${mvFechadosDiarios.somaSegundosCiclo})::numeric / nullif(sum(${mvFechadosDiarios.qtd}) * 86400.0, 0))::text`,
            })
            .from(mvFechadosDiarios)
            .where(
              and(
                gte(mvFechadosDiarios.diaFechamento, fromIso),
                lte(mvFechadosDiarios.diaFechamento, toIso),
                ...mvFechadosConds(filters),
              ),
            ),
          db
            .select({
              count: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int`,
            })
            .from(mvLeadsDiarios)
            .where(
              and(
                inArray(mvLeadsDiarios.status, [
                  "fechado",
                  "perdido",
                  "desqualificado",
                ]),
                gte(mvLeadsDiarios.diaCriacao, fromIso),
                lte(mvLeadsDiarios.diaCriacao, toIso),
                ...mvLeadsConds(filters),
              ),
            ),
          db
            .select({
              count: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int`,
            })
            .from(mvLeadsDiarios)
            .where(
              and(
                eq(mvLeadsDiarios.status, "fechado"),
                gte(mvLeadsDiarios.diaCriacao, fromIso),
                lte(mvLeadsDiarios.diaCriacao, toIso),
                ...mvLeadsConds(filters),
              ),
            ),
          db
            .select({
              valor: sql<string>`coalesce(sum(${mvLeadsDiarios.somaValorCredito}), 0)::text`,
            })
            .from(mvLeadsDiarios)
            .where(
              and(
                notInArray(mvLeadsDiarios.status, [
                  "fechado",
                  "perdido",
                  "desqualificado",
                ]),
                ...mvLeadsConds(filters),
              ),
            ),
        ]
      : [
          // Fallback: leads direto (filter de valor ativo).
          db
            .select({
              avgValor: sql<string>`coalesce(avg(${leads.valorLiberadoCentavos}), 0)::text`,
              avgComissao: sql<string>`coalesce(avg(${leads.comissaoCentavos}), 0)::text`,
              avgCycle: sql<string | null>`avg(extract(epoch from (${leads.dataFechamento}::timestamp - ${leads.createdAt})) / 86400.0)::text`,
            })
            .from(leads)
            .where(
              and(
                eq(leads.status, "fechado"),
                sql`${leads.dataFechamento} >= ${fromIso}::date`,
                sql`${leads.dataFechamento} <= ${toIso}::date`,
                ...baseConds(filters),
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(leads)
            .where(
              and(
                sql`${leads.status} IN ('fechado', 'perdido', 'desqualificado')`,
                gte(leads.createdAt, period.from),
                lte(leads.createdAt, period.to),
                ...baseConds(filters),
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(leads)
            .where(
              and(
                eq(leads.status, "fechado"),
                gte(leads.createdAt, period.from),
                lte(leads.createdAt, period.to),
                ...baseConds(filters),
              ),
            ),
          db
            .select({
              valor: sql<string>`coalesce(sum(${leads.valorCreditoCentavos}), 0)::text`,
            })
            .from(leads)
            .where(
              and(
                notInArray(leads.status, [
                  "fechado",
                  "perdido",
                  "desqualificado",
                ]),
                ...baseConds(filters),
              ),
            ),
        ],
  );
  const winRate =
    resolvedRow.count > 0 ? wonRow.count / resolvedRow.count : 0;

  const avgCycleDays = avgRow.avgCycle ? Number(avgRow.avgCycle) : null;
  const pipelineValor = Number(pipelineRow.valor ?? 0);
  // Sales Velocity = Pipeline × WinRate / SalesCycle
  // Resultado: "R$ esperados por dia" do pipeline atual
  const salesVelocity =
    avgCycleDays && avgCycleDays > 0 && winRate > 0
      ? (pipelineValor * winRate) / avgCycleDays
      : 0;

  return {
    avgDealSizeCentavos: Math.round(Number(avgRow.avgValor ?? 0)),
    avgSalesCycleDays: avgCycleDays,
    salesVelocityCentavosPerDay: Math.round(salesVelocity),
    winRate,
    avgComissaoCentavos: Math.round(Number(avgRow.avgComissao ?? 0)),
  };
}

// ============================================================================
// Conversion rates entre stages adjacentes (Hubspot-style funnel %)
// Usa interações de mudança de status pra trackear progressão.
// ============================================================================

const STAGE_PROGRESSION = [
  "novo",
  "conversa_inicial",
  "aguardando_resposta",
  "aguardando_documentacao",
  "documentacao_enviada",
  "em_negociacao",
  "fechado",
] as const;

export type ConversionStage = {
  fromStatus: string;
  toStatus: string;
  reachedFrom: number; // quantos passaram pelo `fromStatus`
  reachedTo: number; // quantos avançaram pra `toStatus`
  rate: number; // 0..1
};

/**
 * Calcula taxa de conversão entre cada par adjacente de stages do pipeline.
 * Considera "passou pelo stage" quem está no stage OU em algum stage posterior
 * (incl. fechado). Quem foi pra perdido/desqualificado não conta como progressão.
 */
export async function fetchConversionRates(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<ConversionStage[]> {
  const cb = baseConds(filters);
  // Pega leads criados no período (snapshot atual de status)
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

  const map = new Map<string, number>();
  for (const r of rows) map.set(String(r.status), Number(r.count));

  // Quantos chegaram em cada stage (= count no stage + todos posteriores)
  const reachedAt: Record<string, number> = {};
  for (let i = 0; i < STAGE_PROGRESSION.length; i++) {
    let total = 0;
    for (let j = i; j < STAGE_PROGRESSION.length; j++) {
      total += map.get(STAGE_PROGRESSION[j]!) ?? 0;
    }
    reachedAt[STAGE_PROGRESSION[i]!] = total;
  }

  const result: ConversionStage[] = [];
  for (let i = 0; i < STAGE_PROGRESSION.length - 1; i++) {
    const from = STAGE_PROGRESSION[i]!;
    const to = STAGE_PROGRESSION[i + 1]!;
    const rFrom = reachedAt[from]!;
    const rTo = reachedAt[to]!;
    result.push({
      fromStatus: from,
      toStatus: to,
      reachedFrom: rFrom,
      reachedTo: rTo,
      rate: rFrom > 0 ? rTo / rFrom : 0,
    });
  }
  return result;
}

// ============================================================================
// Loss reasons (motivos de perda/desqualificação)
// ============================================================================

export type LossReasonRow = { motivo: string; count: number };

export async function fetchLossReasons(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<LossReasonRow[]> {
  const cb = baseConds(filters);
  const rows = await db
    .select({
      motivo: sql<string>`coalesce(${leads.motivoDesqualificacao}, 'Não informado')`,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(
      and(
        sql`${leads.status} IN ('perdido', 'desqualificado')`,
        gte(leads.createdAt, period.from),
        lte(leads.createdAt, period.to),
        ...cb,
      ),
    )
    .groupBy(sql`coalesce(${leads.motivoDesqualificacao}, 'Não informado')`)
    .orderBy(sql`count(*) desc`);

  return rows.map((r) => ({
    motivo: String(r.motivo),
    count: Number(r.count),
  }));
}

// ============================================================================
// ROI por origem (count, win rate, total liberado)
// ============================================================================

export type OrigemROIRow = {
  origem: string;
  leadsCount: number;
  resolvidos: number;
  fechados: number;
  winRate: number;
  totalLiberadoCentavos: number;
  avgValorBuscadoCentavos: number;
};

export async function fetchOrigemROI(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<OrigemROIRow[]> {
  const fromDateStr = period.from.toISOString().slice(0, 10);
  const toDateStr = period.to.toISOString().slice(0, 10);
  const useMV = canUseMV(filters);

  const rows = useMV
    ? await db
        .select({
          origem: mvLeadsDiarios.origem,
          total: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int`,
          resolvidos: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}) filter (where ${mvLeadsDiarios.status} IN ('fechado', 'perdido', 'desqualificado')), 0)::int`,
          fechados: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}) filter (where ${mvLeadsDiarios.status} = 'fechado'), 0)::int`,
          liberado: sql<string>`coalesce(sum(${mvLeadsDiarios.somaValorLiberado}) filter (where ${mvLeadsDiarios.status} = 'fechado'), 0)::text`,
          // Avg ponderada: SUM(soma_valor_credito) / SUM(qtd) (sum of values
          // / sum of weights). NULLIF evita div/0.
          avgBuscado: sql<string>`(coalesce(sum(${mvLeadsDiarios.somaValorCredito}), 0)::numeric / nullif(sum(${mvLeadsDiarios.qtd}), 0))::text`,
        })
        .from(mvLeadsDiarios)
        .where(
          and(
            gte(mvLeadsDiarios.diaCriacao, fromDateStr),
            lte(mvLeadsDiarios.diaCriacao, toDateStr),
            ...mvLeadsConds(filters),
          ),
        )
        .groupBy(mvLeadsDiarios.origem)
        .orderBy(sql`sum(${mvLeadsDiarios.qtd}) desc`)
    : await db
        .select({
          origem: sql<string>`coalesce(${leads.origem}, 'Sem origem')`,
          total: sql<number>`count(*)::int`,
          resolvidos: sql<number>`count(*) filter (where ${leads.status} IN ('fechado', 'perdido', 'desqualificado'))::int`,
          fechados: sql<number>`count(*) filter (where ${leads.status} = 'fechado')::int`,
          liberado: sql<string>`coalesce(sum(${leads.valorLiberadoCentavos}) filter (where ${leads.status} = 'fechado'), 0)::text`,
          avgBuscado: sql<string>`coalesce(avg(${leads.valorCreditoCentavos}), 0)::text`,
        })
        .from(leads)
        .where(
          and(
            gte(leads.createdAt, period.from),
            lte(leads.createdAt, period.to),
            ...baseConds(filters),
          ),
        )
        .groupBy(sql`coalesce(${leads.origem}, 'Sem origem')`)
        .orderBy(sql`count(*) desc`);

  return rows.map((r) => {
    const total = Number(r.total);
    const resolvidos = Number(r.resolvidos);
    const fechados = Number(r.fechados);
    return {
      origem: String(r.origem),
      leadsCount: total,
      resolvidos,
      fechados,
      winRate: resolvidos > 0 ? fechados / resolvidos : 0,
      totalLiberadoCentavos: Number(r.liberado ?? 0),
      avgValorBuscadoCentavos: Math.round(Number(r.avgBuscado ?? 0)),
    };
  });
}

// ============================================================================
// SLA compliance (% leads com 1º contato dentro do SLA de 30min)
// ============================================================================

export type SlaComplianceRow = {
  totalAtribuidos: number;
  dentroSla: number;
  rate: number; // 0..1
  avgPrimeiroContatoMin: number | null;
};

export async function fetchSlaCompliance(
  rawFilters: ReportFilters,
  period: PeriodRange,
): Promise<SlaComplianceRow> {
  const filters = normalizeFilters(rawFilters);
  const cb = baseConds(filters);
  const fromIso = period.from.toISOString();
  const toIso = period.to.toISOString();
  const consConds: string[] = [];
  if (filters.origens.length > 0) {
    const list = filters.origens
      .map((o) => `'${o.replace(/'/g, "''")}'`)
      .join(",");
    consConds.push(`l.origem IN (${list})`);
  }
  if (filters.consultorIds.length > 0) {
    const list = filters.consultorIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");
    consConds.push(`l.consultor_id IN (${list})`);
  }
  if (filters.ufs.length > 0) {
    const list = filters.ufs.map((uf) => `'${uf.replace(/'/g, "''")}'`).join(",");
    consConds.push(`l.estado IN (${list})`);
  }
  void cb;
  const extra = consConds.length > 0 ? `AND ${consConds.join(" AND ")}` : "";

  const result = await db.execute<{
    total: string;
    dentro: string;
    avg_min: string | null;
  }>(sql.raw(`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE pc.minutos IS NOT NULL AND pc.minutos <= 30)::text AS dentro,
      AVG(pc.minutos)::text AS avg_min
    FROM public.leads l
    LEFT JOIN LATERAL (
      -- Mesmo otimização do fetchPerformanceConsultores: LIMIT 1 com índice
      -- parcial idx_interacoes_manuais_lead.
      SELECT EXTRACT(EPOCH FROM (i.criado_em - l.atribuido_em)) / 60.0 AS minutos
      FROM public.interacoes i
      WHERE i.lead_id = l.id
        AND i.criado_em >= l.atribuido_em
        AND i.tipo NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema')
      ORDER BY i.criado_em ASC
      LIMIT 1
    ) pc ON true
    WHERE l.consultor_id IS NOT NULL
      AND l.atribuido_em >= '${fromIso}'
      AND l.atribuido_em <= '${toIso}'
      ${extra}
  `));

  const r = result[0];
  if (!r) {
    return {
      totalAtribuidos: 0,
      dentroSla: 0,
      rate: 0,
      avgPrimeiroContatoMin: null,
    };
  }
  const total = Number(r.total ?? 0);
  const dentro = Number(r.dentro ?? 0);
  return {
    totalAtribuidos: total,
    dentroSla: dentro,
    rate: total > 0 ? dentro / total : 0,
    avgPrimeiroContatoMin: r.avg_min != null ? Number(r.avg_min) : null,
  };
}

// ============================================================================
// Saúde do pipeline pessoal (esfriando, SLA atrasado, aguardando ação)
// ============================================================================

export type SaudePipeline = {
  esfriando: number;
  slaAtrasado: number;
  aguardandoAcao: number;
};

/**
 * 3 contadores agregados pra um consultor específico:
 *  - esfriando: leads ativos sem interação manual há 5+ dias (alinhado com
 *    o alerta de borda vermelha em listagens).
 *  - slaAtrasado: leads novos atribuídos há 30+ minutos sem 1ª interação.
 *  - aguardandoAcao: leads que demandam movimento — status='novo' há >2h, ou
 *    'conversa_inicial' sem update há 24h+, ou 'aguardando_documentacao' há 5d+.
 */
export async function fetchSaudePipeline(
  consultorId: string,
): Promise<SaudePipeline> {
  const result = await db.execute<{
    esfriando: string;
    sla_atrasado: string;
    aguardando_acao: string;
  }>(sql.raw(`
    WITH base AS (
      SELECT l.id, l.status, l.atribuido_em, l.ultimo_contato, l.updated_at,
        COALESCE(
          (
            SELECT MAX(i.criado_em) FROM public.interacoes i
            WHERE i.lead_id = l.id
              AND i.tipo NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema')
          ),
          NULL
        ) AS ultima_interacao_manual
      FROM public.leads l
      WHERE l.consultor_id = '${consultorId.replace(/'/g, "''")}'
        AND l.status NOT IN ('fechado', 'perdido', 'desqualificado')
    )
    SELECT
      COUNT(*) FILTER (
        WHERE ultima_interacao_manual IS NULL AND atribuido_em < NOW() - INTERVAL '5 days'
        OR ultima_interacao_manual < NOW() - INTERVAL '5 days'
      )::text AS esfriando,
      COUNT(*) FILTER (
        WHERE status = 'novo'
        AND atribuido_em IS NOT NULL
        AND atribuido_em < NOW() - INTERVAL '30 minutes'
        AND ultima_interacao_manual IS NULL
      )::text AS sla_atrasado,
      COUNT(*) FILTER (
        WHERE
          (status = 'novo' AND atribuido_em < NOW() - INTERVAL '2 hours')
          OR (status = 'conversa_inicial' AND COALESCE(ultima_interacao_manual, atribuido_em) < NOW() - INTERVAL '24 hours')
          OR (status = 'aguardando_documentacao' AND updated_at < NOW() - INTERVAL '5 days')
      )::text AS aguardando_acao
    FROM base
  `));
  const r = result[0];
  if (!r) return { esfriando: 0, slaAtrasado: 0, aguardandoAcao: 0 };
  return {
    esfriando: Number(r.esfriando ?? 0),
    slaAtrasado: Number(r.sla_atrasado ?? 0),
    aguardandoAcao: Number(r.aguardando_acao ?? 0),
  };
}

// ============================================================================
// Histórico detalhado de fechamentos no período (pra /meu-desempenho)
// ============================================================================

export type FechamentoRow = {
  leadId: string;
  leadNome: string;
  bancoAprovador: string | null;
  valorLiberadoCentavos: number;
  comissaoCentavos: number;
  dataFechamento: string; // YYYY-MM-DD
  cicloDias: number;
};

export async function fetchHistoricoFechamentos(
  consultorId: string,
  period: PeriodRange,
): Promise<FechamentoRow[]> {
  const result = await db.execute<{
    lead_id: string;
    lead_nome: string;
    banco: string | null;
    valor_liberado: string;
    comissao: string;
    data_fechamento: string;
    ciclo_dias: string;
  }>(sql.raw(`
    SELECT
      l.id AS lead_id,
      l.nome AS lead_nome,
      l.banco_aprovador AS banco,
      COALESCE(l.valor_liberado_centavos, 0)::text AS valor_liberado,
      COALESCE(l.comissao_centavos, 0)::text AS comissao,
      to_char(l.data_fechamento, 'YYYY-MM-DD') AS data_fechamento,
      EXTRACT(EPOCH FROM (l.data_fechamento::timestamp - l.created_at)) / 86400.0 AS ciclo_dias
    FROM public.leads l
    WHERE l.consultor_id = '${consultorId.replace(/'/g, "''")}'
      AND l.status = 'fechado'
      AND l.data_fechamento >= '${period.from.toISOString().slice(0, 10)}'::date
      AND l.data_fechamento <= '${period.to.toISOString().slice(0, 10)}'::date
    ORDER BY l.data_fechamento DESC
  `));
  return result.map((r) => ({
    leadId: r.lead_id,
    leadNome: r.lead_nome,
    bancoAprovador: r.banco,
    valorLiberadoCentavos: Number(r.valor_liberado ?? 0),
    comissaoCentavos: Number(r.comissao ?? 0),
    dataFechamento: r.data_fechamento,
    cicloDias: Math.round(Number(r.ciclo_dias ?? 0)),
  }));
}

// ============================================================================
// Volume de leads atribuídos por dia (pra um consultor) — sem segmentar
// ============================================================================

export type VolumeAtribuidoPorDia = { dia: string; count: number };

export async function fetchVolumeAtribuidoPorDia(
  consultorId: string,
  period: PeriodRange,
): Promise<VolumeAtribuidoPorDia[]> {
  const result = await db.execute<{ dia: string; count: string }>(sql.raw(`
    SELECT
      to_char(date_trunc('day', l.atribuido_em), 'YYYY-MM-DD') AS dia,
      COUNT(*)::text AS count
    FROM public.leads l
    WHERE l.consultor_id = '${consultorId.replace(/'/g, "''")}'
      AND l.atribuido_em IS NOT NULL
      AND l.atribuido_em >= '${period.from.toISOString()}'
      AND l.atribuido_em <= '${period.to.toISOString()}'
    GROUP BY date_trunc('day', l.atribuido_em)
    ORDER BY date_trunc('day', l.atribuido_em)
  `));
  return result.map((r) => ({ dia: r.dia, count: Number(r.count ?? 0) }));
}

// ============================================================================
// Performance por estado (UF) — leads, R$, conversão
// ============================================================================

export type PerformanceUfRow = {
  uf: string;
  leadsCount: number;
  pipelineCount: number;
  fechados: number;
  totalBuscadoCentavos: number;
  totalLiberadoCentavos: number;
  taxaConversao: number;
};

export async function fetchPerformancePorUf(
  rawFilters: ReportFilters,
  period: PeriodRange,
): Promise<PerformanceUfRow[]> {
  const filters = normalizeFilters(rawFilters);
  // Não filtra por UF aqui (queremos VER por UF). Mantém demais.
  const filtersWithoutUf = { ...filters, ufs: [] };
  const fromDateStr = period.from.toISOString().slice(0, 10);
  const toDateStr = period.to.toISOString().slice(0, 10);
  const useMV = canUseMV(filters);

  const rows = useMV
    ? await db
        .select({
          uf: mvLeadsDiarios.estado,
          total: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}), 0)::int`,
          pipeline: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}) filter (where ${mvLeadsDiarios.status} not in ('fechado','perdido','desqualificado')), 0)::int`,
          fechados: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}) filter (where ${mvLeadsDiarios.status} = 'fechado'), 0)::int`,
          buscado: sql<string>`coalesce(sum(${mvLeadsDiarios.somaValorCredito}), 0)::text`,
          liberado: sql<string>`coalesce(sum(${mvLeadsDiarios.somaValorLiberado}) filter (where ${mvLeadsDiarios.status} = 'fechado'), 0)::text`,
          resolvidos: sql<number>`coalesce(sum(${mvLeadsDiarios.qtd}) filter (where ${mvLeadsDiarios.status} in ('fechado','perdido','desqualificado')), 0)::int`,
        })
        .from(mvLeadsDiarios)
        .where(
          and(
            gte(mvLeadsDiarios.diaCriacao, fromDateStr),
            lte(mvLeadsDiarios.diaCriacao, toDateStr),
            ...mvLeadsConds(filtersWithoutUf),
          ),
        )
        .groupBy(mvLeadsDiarios.estado)
        .orderBy(sql`sum(${mvLeadsDiarios.qtd}) desc`)
    : await db
        .select({
          uf: sql<string>`coalesce(${leads.estado}, '—')`,
          total: sql<number>`count(*)::int`,
          pipeline: sql<number>`count(*) filter (where ${leads.status} not in ('fechado','perdido','desqualificado'))::int`,
          fechados: sql<number>`count(*) filter (where ${leads.status} = 'fechado')::int`,
          buscado: sql<string>`coalesce(sum(${leads.valorCreditoCentavos}), 0)::text`,
          liberado: sql<string>`coalesce(sum(${leads.valorLiberadoCentavos}) filter (where ${leads.status} = 'fechado'), 0)::text`,
          resolvidos: sql<number>`count(*) filter (where ${leads.status} in ('fechado','perdido','desqualificado'))::int`,
        })
        .from(leads)
        .where(
          and(
            gte(leads.createdAt, period.from),
            lte(leads.createdAt, period.to),
            ...baseConds(filtersWithoutUf),
          ),
        )
        .groupBy(sql`coalesce(${leads.estado}, '—')`)
        .orderBy(sql`count(*) desc`);

  return rows.map((r) => {
    const fechados = Number(r.fechados);
    const resolvidos = Number(r.resolvidos);
    return {
      uf: String(r.uf),
      leadsCount: Number(r.total),
      pipelineCount: Number(r.pipeline),
      fechados,
      totalBuscadoCentavos: Number(r.buscado ?? 0),
      totalLiberadoCentavos: Number(r.liberado ?? 0),
      taxaConversao: resolvidos > 0 ? fechados / resolvidos : 0,
    };
  });
}

// ============================================================================
// UFs distintas (pra autocomplete de filtros)
// ============================================================================

export const fetchUfsDistintas = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .selectDistinct({ uf: leads.estado })
      .from(leads);
    return rows
      .map((r) => r.uf)
      .filter((u): u is string => Boolean(u))
      .sort();
  },
  ["reports:ufs-distintas"],
  { revalidate: 300, tags: ["reports:lookups"] },
);

// ============================================================================
// PAINEL EXECUTIVO — queries estratégicas (admin only no caller)
// ============================================================================

// ----------------------------------------------------------------------------
// Projeção de receita do mês corrente
// ----------------------------------------------------------------------------

export type ProjecaoMes = {
  comissaoFechadaCentavos: number;
  pipelineEmNegociacaoCentavos: number;
  ticketMedioCentavos: number;
  comissaoMediaCentavos: number;
  winRateHistorico: number; // 0..1 (rolling 90d)
  projetadoCentavos: number;
  /** Quantos leads atualmente em em_negociacao. */
  emNegociacaoCount: number;
};

export async function fetchProjecaoMes(): Promise<ProjecaoMes> {
  // Comissão já fechada no mês corrente
  const result = await db.execute<{
    comissao_fechada: string;
    pipeline_em_negociacao: string;
    ticket_medio: string;
    comissao_media: string;
    em_negociacao_count: string;
    win_rate: string;
  }>(sql.raw(`
    WITH mes_atual AS (
      SELECT
        COALESCE(SUM(comissao_centavos), 0)::text AS comissao_fechada
      FROM public.leads
      WHERE status = 'fechado'
        AND data_fechamento >= date_trunc('month', NOW())
        AND data_fechamento < date_trunc('month', NOW()) + INTERVAL '1 month'
    ),
    pipeline AS (
      SELECT
        COALESCE(SUM(valor_credito_centavos), 0)::text AS pipeline_em_negociacao,
        COUNT(*)::text AS em_negociacao_count
      FROM public.leads
      WHERE status = 'em_negociacao'
    ),
    fechados_90d AS (
      SELECT
        COALESCE(AVG(valor_liberado_centavos), 0)::text AS ticket_medio,
        COALESCE(AVG(comissao_centavos), 0)::text AS comissao_media,
        COUNT(*)::int AS fechados_count
      FROM public.leads
      WHERE status = 'fechado'
        AND created_at >= NOW() - INTERVAL '90 days'
    ),
    resolvidos_90d AS (
      SELECT COUNT(*)::int AS total
      FROM public.leads
      WHERE status IN ('fechado', 'perdido', 'desqualificado')
        AND created_at >= NOW() - INTERVAL '90 days'
    )
    SELECT
      ma.comissao_fechada,
      p.pipeline_em_negociacao,
      p.em_negociacao_count,
      f.ticket_medio,
      f.comissao_media,
      CASE WHEN r.total > 0 THEN (f.fechados_count::numeric / r.total)::text ELSE '0' END AS win_rate
    FROM mes_atual ma, pipeline p, fechados_90d f, resolvidos_90d r
  `));

  const r = result[0];
  if (!r) {
    return {
      comissaoFechadaCentavos: 0,
      pipelineEmNegociacaoCentavos: 0,
      ticketMedioCentavos: 0,
      comissaoMediaCentavos: 0,
      winRateHistorico: 0,
      projetadoCentavos: 0,
      emNegociacaoCount: 0,
    };
  }

  const comissaoFechada = Number(r.comissao_fechada ?? 0);
  const emNegociacaoCount = Number(r.em_negociacao_count ?? 0);
  const comissaoMedia = Number(r.comissao_media ?? 0);
  const winRate = Number(r.win_rate ?? 0);
  const expectedAdicional = Math.round(
    emNegociacaoCount * comissaoMedia * winRate,
  );

  return {
    comissaoFechadaCentavos: comissaoFechada,
    pipelineEmNegociacaoCentavos: Number(r.pipeline_em_negociacao ?? 0),
    ticketMedioCentavos: Math.round(Number(r.ticket_medio ?? 0)),
    comissaoMediaCentavos: Math.round(comissaoMedia),
    winRateHistorico: winRate,
    projetadoCentavos: comissaoFechada + expectedAdicional,
    emNegociacaoCount,
  };
}

// ----------------------------------------------------------------------------
// Pipeline em R$ por status (barras horizontais)
// ----------------------------------------------------------------------------

export type PipelineEmReaisRow = {
  status: string;
  count: number;
  totalCentavos: number;
};

export async function fetchPipelineEmReais(): Promise<PipelineEmReaisRow[]> {
  const rows = await db
    .select({
      status: leads.status,
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${leads.valorCreditoCentavos}), 0)::text`,
    })
    .from(leads)
    .where(notInArray(leads.status, ["fechado", "perdido", "desqualificado"]))
    .groupBy(leads.status);
  return rows.map((r) => ({
    status: String(r.status),
    count: Number(r.count),
    totalCentavos: Number(r.total ?? 0),
  }));
}

// ----------------------------------------------------------------------------
// Percentis de tempo (P25/P50/P75/P90) entre milestones
// ----------------------------------------------------------------------------

export type PercentilRow = {
  metrica: string;
  unidade: "min" | "horas" | "dias";
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
};

export async function fetchTempoPercentis(
  period: PeriodRange,
): Promise<PercentilRow[]> {
  // Cacheado: 3 queries com percentile_cont. Pesado quando há muitos
  // fechados; resultado muda pouco em janelas de minutos.
  return unstable_cache(
    () => fetchTempoPercentisUncached(period),
    [
      "reports:tempo-percentis",
      bucketHour(period.from),
      bucketHour(period.to),
    ],
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
}

async function fetchTempoPercentisUncached(
  period: PeriodRange,
): Promise<PercentilRow[]> {
  const fromIso = period.from.toISOString();
  const toIso = period.to.toISOString();

  // 1. Atribuição → 1º contato (minutos) — pra leads atribuídos no período
  const r1 = await db.execute<{
    p25: string;
    p50: string;
    p75: string;
    p90: string;
  }>(sql.raw(`
    WITH tempos AS (
      SELECT EXTRACT(EPOCH FROM (MIN(i.criado_em) - l.atribuido_em)) / 60.0 AS minutos
      FROM public.leads l
      JOIN public.interacoes i ON i.lead_id = l.id
      WHERE l.atribuido_em IS NOT NULL
        AND l.atribuido_em >= '${fromIso}'
        AND l.atribuido_em <= '${toIso}'
        AND i.criado_em >= l.atribuido_em
        AND i.tipo NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema')
      GROUP BY l.id, l.atribuido_em
    )
    SELECT
      COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY minutos), 0)::text AS p25,
      COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY minutos), 0)::text AS p50,
      COALESCE(percentile_cont(0.75) WITHIN GROUP (ORDER BY minutos), 0)::text AS p75,
      COALESCE(percentile_cont(0.90) WITHIN GROUP (ORDER BY minutos), 0)::text AS p90
    FROM tempos
  `));

  // 2. Criação → fechamento (dias) — pra leads fechados no período
  const r2 = await db.execute<{
    p25: string;
    p50: string;
    p75: string;
    p90: string;
  }>(sql.raw(`
    WITH ciclos AS (
      SELECT EXTRACT(EPOCH FROM (data_fechamento::timestamp - created_at)) / 86400.0 AS dias
      FROM public.leads
      WHERE status = 'fechado'
        AND data_fechamento >= '${period.from.toISOString().slice(0, 10)}'::date
        AND data_fechamento <= '${period.to.toISOString().slice(0, 10)}'::date
    )
    SELECT
      COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY dias), 0)::text AS p25,
      COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY dias), 0)::text AS p50,
      COALESCE(percentile_cont(0.75) WITHIN GROUP (ORDER BY dias), 0)::text AS p75,
      COALESCE(percentile_cont(0.90) WITHIN GROUP (ORDER BY dias), 0)::text AS p90
    FROM ciclos
  `));

  // 3. Atribuição → fechamento (dias) — quanto tempo tomou nas mãos do consultor
  const r3 = await db.execute<{
    p25: string;
    p50: string;
    p75: string;
    p90: string;
  }>(sql.raw(`
    WITH ciclos AS (
      SELECT EXTRACT(EPOCH FROM (data_fechamento::timestamp - atribuido_em)) / 86400.0 AS dias
      FROM public.leads
      WHERE status = 'fechado'
        AND atribuido_em IS NOT NULL
        AND data_fechamento >= '${period.from.toISOString().slice(0, 10)}'::date
        AND data_fechamento <= '${period.to.toISOString().slice(0, 10)}'::date
    )
    SELECT
      COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY dias), 0)::text AS p25,
      COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY dias), 0)::text AS p50,
      COALESCE(percentile_cont(0.75) WITHIN GROUP (ORDER BY dias), 0)::text AS p75,
      COALESCE(percentile_cont(0.90) WITHIN GROUP (ORDER BY dias), 0)::text AS p90
    FROM ciclos
  `));

  function pickRow(rs: {
    p25: string;
    p50: string;
    p75: string;
    p90: string;
  }[]): { p25: number | null; p50: number | null; p75: number | null; p90: number | null } {
    const r = rs[0];
    if (!r)
      return { p25: null, p50: null, p75: null, p90: null };
    const conv = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return {
      p25: conv(r.p25),
      p50: conv(r.p50),
      p75: conv(r.p75),
      p90: conv(r.p90),
    };
  }

  return [
    { metrica: "Atribuição → 1º contato", unidade: "min", ...pickRow(r1) },
    { metrica: "Criação → fechamento", unidade: "dias", ...pickRow(r2) },
    { metrica: "Atribuição → fechamento", unidade: "dias", ...pickRow(r3) },
  ];
}

// ----------------------------------------------------------------------------
// Top origens detalhadas (origem + utm_source + utm_campaign)
// ----------------------------------------------------------------------------

export type TopOrigemRow = {
  origem: string;
  utmSource: string;
  utmCampaign: string;
  leads: number;
  fechados: number;
  totalLiberadoCentavos: number;
  taxa: number;
};

export async function fetchTopOrigensDetalhadas(
  period: PeriodRange,
  limit: number = 10,
): Promise<TopOrigemRow[]> {
  return unstable_cache(
    () => fetchTopOrigensDetalhadasUncached(period, limit),
    [
      "reports:top-origens",
      bucketHour(period.from),
      bucketHour(period.to),
      String(limit),
    ],
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
}

async function fetchTopOrigensDetalhadasUncached(
  period: PeriodRange,
  limit: number = 10,
): Promise<TopOrigemRow[]> {
  const rows = await db.execute<{
    origem: string;
    utm_source: string;
    utm_campaign: string;
    leads_count: string;
    fechados: string;
    liberado: string;
    resolvidos: string;
  }>(sql.raw(`
    SELECT
      COALESCE(origem, '—') AS origem,
      COALESCE(utm_source, '—') AS utm_source,
      COALESCE(utm_campaign, '—') AS utm_campaign,
      COUNT(*)::text AS leads_count,
      COUNT(*) FILTER (WHERE status = 'fechado')::text AS fechados,
      COALESCE(SUM(valor_liberado_centavos) FILTER (WHERE status = 'fechado'), 0)::text AS liberado,
      COUNT(*) FILTER (WHERE status IN ('fechado', 'perdido', 'desqualificado'))::text AS resolvidos
    FROM public.leads
    WHERE created_at >= '${period.from.toISOString()}'
      AND created_at <= '${period.to.toISOString()}'
    GROUP BY COALESCE(origem, '—'), COALESCE(utm_source, '—'), COALESCE(utm_campaign, '—')
    ORDER BY SUM(valor_liberado_centavos) FILTER (WHERE status = 'fechado') DESC NULLS LAST,
             COUNT(*) DESC
    LIMIT ${limit}
  `));

  return rows.map((r) => {
    const fechados = Number(r.fechados ?? 0);
    const resolvidos = Number(r.resolvidos ?? 0);
    return {
      origem: r.origem,
      utmSource: r.utm_source,
      utmCampaign: r.utm_campaign,
      leads: Number(r.leads_count ?? 0),
      fechados,
      totalLiberadoCentavos: Number(r.liberado ?? 0),
      taxa: resolvidos > 0 ? fechados / resolvidos : 0,
    };
  });
}

// ----------------------------------------------------------------------------
// Comparativo de períodos (8 métricas × atual/anterior/Δ)
// ----------------------------------------------------------------------------

export type ComparativoRow = {
  metrica: string;
  atual: number;
  anterior: number;
  /** Quando aplicável: "R$" pra valores em centavos, "%" pra taxas. */
  formato: "numero" | "centavos" | "pct" | "dias";
};

export async function fetchComparativoPeriodos(
  filters: ReportFilters,
  curr: PeriodRange,
  prev: PeriodRange,
): Promise<ComparativoRow[]> {
  return unstable_cache(
    () => fetchComparativoPeriodosUncached(filters, curr, prev),
    [
      ...cacheKeyFor("reports:comparativo", filters, curr),
      bucketHour(prev.from),
      bucketHour(prev.to),
    ],
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
}

async function fetchComparativoPeriodosUncached(
  filters: ReportFilters,
  curr: PeriodRange,
  prev: PeriodRange,
): Promise<ComparativoRow[]> {
  const [kCurr, kPrev, sCurr, sPrev] = await Promise.all([
    fetchKpis(filters, curr),
    fetchKpis(filters, prev),
    fetchSalesMetrics(filters, curr),
    fetchSalesMetrics(filters, prev),
  ]);

  return [
    {
      metrica: "Leads novos",
      atual: kCurr.leadsNovosCount,
      anterior: kPrev.leadsNovosCount,
      formato: "numero",
    },
    {
      metrica: "Leads fechados",
      atual: kCurr.fechadosCount,
      anterior: kPrev.fechadosCount,
      formato: "numero",
    },
    {
      metrica: "R$ liberado",
      atual: kCurr.fechadosValorLiberadoCentavos,
      anterior: kPrev.fechadosValorLiberadoCentavos,
      formato: "centavos",
    },
    {
      metrica: "R$ comissão",
      atual: kCurr.fechadosComissaoCentavos,
      anterior: kPrev.fechadosComissaoCentavos,
      formato: "centavos",
    },
    {
      metrica: "Ticket médio",
      atual: sCurr.avgDealSizeCentavos,
      anterior: sPrev.avgDealSizeCentavos,
      formato: "centavos",
    },
    {
      metrica: "Ciclo médio",
      atual: sCurr.avgSalesCycleDays ?? 0,
      anterior: sPrev.avgSalesCycleDays ?? 0,
      formato: "dias",
    },
    {
      metrica: "Win rate",
      atual: sCurr.winRate * 100,
      anterior: sPrev.winRate * 100,
      formato: "pct",
    },
    {
      metrica: "Pipeline ativo (R$)",
      atual: kCurr.pipelineValorCentavos,
      anterior: kPrev.pipelineValorCentavos,
      formato: "centavos",
    },
  ];
}

// ----------------------------------------------------------------------------
// Sparklines: receita dos últimos N períodos (mensais)
// ----------------------------------------------------------------------------

export type SparklinePoint = { mes: string; valor: number };

export async function fetchSparkRevenue(
  meses: number = 6,
): Promise<{
  comissao: SparklinePoint[];
  liberado: SparklinePoint[];
  ticketMedio: SparklinePoint[];
  cicloMedio: SparklinePoint[];
}> {
  return unstable_cache(
    () => fetchSparkRevenueUncached(meses),
    ["reports:spark-revenue", String(meses)],
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
}

async function fetchSparkRevenueUncached(meses: number): Promise<{
  comissao: SparklinePoint[];
  liberado: SparklinePoint[];
  ticketMedio: SparklinePoint[];
  cicloMedio: SparklinePoint[];
}> {
  // Sempre lê da MV (não recebe filtros granulares). Ticket médio e ciclo
  // médio são calculados como médias ponderadas: SUM(soma) / SUM(qtd).
  const rows = await db.execute<{
    mes: string;
    comissao: string;
    liberado: string;
    ticket: string;
    ciclo: string | null;
  }>(sql.raw(`
    SELECT
      to_char(date_trunc('month', dia_fechamento), 'YYYY-MM') AS mes,
      COALESCE(SUM(soma_comissao), 0)::text AS comissao,
      COALESCE(SUM(soma_valor_liberado), 0)::text AS liberado,
      (COALESCE(SUM(soma_valor_liberado), 0)::numeric / NULLIF(SUM(qtd), 0))::text AS ticket,
      (SUM(soma_segundos_ciclo)::numeric / NULLIF(SUM(qtd) * 86400.0, 0))::text AS ciclo
    FROM public.mv_fechados_diarios
    WHERE dia_fechamento >= date_trunc('month', NOW() - INTERVAL '${meses - 1} months')::date
    GROUP BY date_trunc('month', dia_fechamento)
    ORDER BY date_trunc('month', dia_fechamento)
  `));

  return {
    comissao: rows.map((r) => ({ mes: r.mes, valor: Number(r.comissao ?? 0) })),
    liberado: rows.map((r) => ({ mes: r.mes, valor: Number(r.liberado ?? 0) })),
    ticketMedio: rows.map((r) => ({ mes: r.mes, valor: Number(r.ticket ?? 0) })),
    cicloMedio: rows.map((r) => ({ mes: r.mes, valor: r.ciclo ? Number(r.ciclo) : 0 })),
  };
}

// ============================================================================
// Distribuições demográficas/operacionais (% por categoria)
// ============================================================================

export type DistribRow = { valor: string; count: number; pct: number };

export type Distribuicoes = {
  tipoPessoa: DistribRow[];
  objetivoCredito: DistribRow[];
  tipoImovel: DistribRow[];
  situacaoImovel: DistribRow[];
  ocupacao: DistribRow[];
  estadoCivil: DistribRow[];
  totalLeads: number;
};

/**
 * Agrega 6 distribuições demográficas/operacionais dos leads no período,
 * respeitando filtros (consultor/origem/uf/valor). Útil pra entender quem é
 * o lead típico que chega — base pra decisões de marketing e produto.
 *
 * Usa um único scan com FILTER (WHERE ...) por valor pra evitar 6 queries
 * separadas. Performance: ~1 plano de query agregando tudo.
 */
export async function fetchDistribuicoes(
  rawFilters: ReportFilters,
  period: PeriodRange,
): Promise<Distribuicoes> {
  return unstable_cache(
    () => fetchDistribuicoesUncached(rawFilters, period),
    cacheKeyFor("reports:distribuicoes", rawFilters, period),
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
}

async function fetchDistribuicoesUncached(
  rawFilters: ReportFilters,
  period: PeriodRange,
): Promise<Distribuicoes> {
  const filters = normalizeFilters(rawFilters);
  const cb = baseConds(filters);

  // Single-pass com group sets via UNION ALL — uma query, 6 dimensões
  const fromIso = period.from.toISOString();
  const toIso = period.to.toISOString();

  // Onde-clause em SQL raw pra reaproveitar nas 6 sub-queries
  const consConds: string[] = [
    `created_at >= '${fromIso}'`,
    `created_at <= '${toIso}'`,
  ];
  if (filters.consultorIds.length > 0) {
    const list = filters.consultorIds
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(",");
    consConds.push(`consultor_id IN (${list})`);
  }
  if (filters.origens.length > 0) {
    const list = filters.origens
      .map((o) => `'${o.replace(/'/g, "''")}'`)
      .join(",");
    consConds.push(`origem IN (${list})`);
  }
  if (filters.ufs.length > 0) {
    const list = filters.ufs.map((uf) => `'${uf.replace(/'/g, "''")}'`).join(",");
    consConds.push(`estado IN (${list})`);
  }
  if (filters.valorMinCentavos != null) {
    consConds.push(`valor_credito_centavos >= ${filters.valorMinCentavos}`);
  }
  if (filters.valorMaxCentavos != null) {
    consConds.push(`valor_credito_centavos <= ${filters.valorMaxCentavos}`);
  }
  const whereClause = consConds.join(" AND ");

  // Pega total + 6 distribuições em paralelo (Promise.all dentro do mesmo
  // pool de conexões — fica rápido em produção mas sequencial em dev se
  // max=1, ainda assim < 100ms cada).
  const [
    totalRow,
    tipoPessoa,
    objetivoCredito,
    tipoImovel,
    situacaoImovel,
    ocupacao,
    estadoCivil,
  ] = await Promise.all([
    db.execute<{ total: string }>(
      sql.raw(
        `SELECT COUNT(*)::text AS total FROM public.leads WHERE ${whereClause}`,
      ),
    ),
    distribOf("tipo_pessoa", whereClause),
    distribOf("objetivo_credito", whereClause),
    distribOf("tipo_imovel", whereClause),
    distribOf("situacao_imovel", whereClause),
    distribOf("ocupacao", whereClause),
    distribOf("estado_civil", whereClause),
  ]);

  void cb;
  const totalLeads = Number(totalRow[0]?.total ?? 0);

  return {
    tipoPessoa,
    objetivoCredito,
    tipoImovel,
    situacaoImovel,
    ocupacao,
    estadoCivil,
    totalLeads,
  };
}

async function distribOf(
  column: string,
  whereClause: string,
): Promise<DistribRow[]> {
  const rows = await db.execute<{ valor: string; count: string }>(
    sql.raw(`
      SELECT
        COALESCE(${column}, 'Não informado') AS valor,
        COUNT(*)::text AS count
      FROM public.leads
      WHERE ${whereClause}
      GROUP BY COALESCE(${column}, 'Não informado')
      ORDER BY COUNT(*) DESC
    `),
  );
  const total = rows.reduce((s, r) => s + Number(r.count ?? 0), 0);
  return rows.map((r) => {
    const count = Number(r.count ?? 0);
    return {
      valor: r.valor,
      count,
      pct: total > 0 ? count / total : 0,
    };
  });
}

// ============================================================================
// Saúde global (esfriando) — agregado de toda operação, sem filtro de consultor
// ============================================================================

/**
 * Conta leads ATIVOS (status não-terminal) "esfriando" — sem interação
 * manual há 5+ dias OU nunca tiveram interação manual e foram atribuídos
 * há 5+ dias.
 *
 * Threshold alinhado com o alerta de borda vermelha em listagens (mesma
 * janela de 5 dias = uma única "régua" pra todo o sistema).
 *
 * Usado pelo card "Pipeline esfriando" em /relatorios.
 */
export async function fetchEsfriandoGlobal(): Promise<{ count: number }> {
  // Reescrita: antes usava subquery correlata em interacoes por linha de
  // leads — O(N) seeks. Agora: LEFT JOIN LATERAL com LIMIT 1 contra o índice
  // parcial idx_interacoes_manuais_lead (criado em 0008). Postgres consegue
  // pular pra primeira linha do índice por (lead_id, criado_em DESC) sem
  // varrer interacoes inteira.
  const result = await db.execute<{ count: string }>(sql.raw(`
    SELECT COUNT(*)::text AS count
    FROM public.leads l
    LEFT JOIN LATERAL (
      SELECT i.criado_em
      FROM public.interacoes i
      WHERE i.lead_id = l.id
        AND i.tipo NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema')
      ORDER BY i.criado_em DESC
      LIMIT 1
    ) ult ON true
    WHERE l.status NOT IN ('fechado', 'perdido', 'desqualificado')
      AND (
        (ult.criado_em IS NULL AND l.atribuido_em < NOW() - INTERVAL '5 days')
        OR ult.criado_em < NOW() - INTERVAL '5 days'
      )
  `));
  return { count: Number(result[0]?.count ?? 0) };
}

// ============================================================================
// KPIs por consultor — métrica baseada em atribuido_em (não created_at)
//
// Diferente de fetchKpis (que conta `created_at`), esta variante conta leads
// pela data de ATRIBUIÇÃO ao consultor. Pra /meu-desempenho isso é correto
// porque:
//   - Um lead criado mês passado mas atribuído hoje conta na semana atual.
//   - Um lead atribuído mês passado e movido pra outro consultor hoje
//     ainda conta no histórico do consultor original (atribuido_em é o
//     primeiro momento de atribuição — preservado).
//
// fetchKpis global continua usando created_at (correto pra visão da operação
// inteira: "quantos leads NOVOS chegaram no funil no período").
// ============================================================================

export type KpisConsultor = {
  atribuidosCount: number;
  pipelineCount: number;
  pipelineValorCentavos: number;
  fechadosCount: number;
  fechadosValorLiberadoCentavos: number;
  fechadosComissaoCentavos: number;
  /**
   * Taxa de conversão LOCAL ao período: fechados / atribuídos no período.
   * Diferente da rolling 90d global do fetchKpis.
   */
  conversaoPeriodo: { atribuidos: number; fechados: number; taxa: number };
};

export async function fetchKpisConsultor(
  consultorId: string,
  period: PeriodRange,
): Promise<KpisConsultor> {
  // Atribuídos NO PERÍODO (atribuido_em entre from..to, mesmo consultor).
  const [atribRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        eq(leads.consultorId, consultorId),
        sql`${leads.atribuidoEm} >= ${period.from.toISOString()}`,
        sql`${leads.atribuidoEm} <= ${period.to.toISOString()}`,
      ),
    );

  // Pipeline ATUAL (snapshot agora) — desse consultor, status não-terminal.
  const [pipelineRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      valor: sql<string>`coalesce(sum(${leads.valorCreditoCentavos}), 0)::text`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.consultorId, consultorId),
        notInArray(leads.status, [
          "fechado",
          "perdido",
          "desqualificado",
        ]),
      ),
    );

  // Fechados no período (data_fechamento entre from..to, mesmo consultor).
  const [fechRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      valorLiberado: sql<string>`coalesce(sum(${leads.valorLiberadoCentavos}), 0)::text`,
      comissao: sql<string>`coalesce(sum(${leads.comissaoCentavos}), 0)::text`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.consultorId, consultorId),
        eq(leads.status, "fechado"),
        sql`${leads.dataFechamento} >= ${period.from.toISOString().slice(0, 10)}::date`,
        sql`${leads.dataFechamento} <= ${period.to.toISOString().slice(0, 10)}::date`,
      ),
    );

  const atribuidos = atribRow.count;
  const fechados = fechRow.count;
  return {
    atribuidosCount: atribuidos,
    pipelineCount: pipelineRow.count,
    pipelineValorCentavos: Number(pipelineRow.valor ?? 0),
    fechadosCount: fechados,
    fechadosValorLiberadoCentavos: Number(fechRow.valorLiberado ?? 0),
    fechadosComissaoCentavos: Number(fechRow.comissao ?? 0),
    conversaoPeriodo: {
      atribuidos,
      fechados,
      taxa: atribuidos > 0 ? fechados / atribuidos : 0,
    },
  };
}

// ============================================================================
// MQL / SQL — funil de qualificação (marketing → vendas)
//   MQL = lead ATRIBUÍDO a um consultor (passou o roteamento; minimamente
//         qualificado à primeira vista).
//   SQL = MQL que o comercial NÃO desqualificou — ou seja, aceito como
//         oportunidade real (pode estar em andamento, perdido ou fechado).
// Cohort por created_at (entrada), respeitando os filtros do dashboard.
// ============================================================================

export type MqlSqlResumo = {
  leads: number; // total recebidos no período
  mql: number; // atribuídos
  sql: number; // mql e NÃO desqualificado
  desqualificados: number; // mql e desqualificado
  fechados: number; // ganhos (subconjunto de sql)
  perdidos: number; // perdidos (subconjunto de sql)
};

export const fetchMqlSql = cache(async function fetchMqlSql(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<MqlSqlResumo> {
  return unstable_cache(
    () => fetchMqlSqlUncached(filters, period),
    cacheKeyFor("reports:mql-sql", filters, period),
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
});

async function fetchMqlSqlUncached(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<MqlSqlResumo> {
  const cb = baseConds(filters);
  const atribuido = sql`${leads.atribuidoEm} is not null`;
  const [row] = await db
    .select({
      leads: sql<number>`count(*)::int`,
      mql: sql<number>`(count(*) filter (where ${atribuido}))::int`,
      sql: sql<number>`(count(*) filter (where ${atribuido} and ${leads.status} <> 'desqualificado'))::int`,
      desqualificados: sql<number>`(count(*) filter (where ${atribuido} and ${leads.status} = 'desqualificado'))::int`,
      fechados: sql<number>`(count(*) filter (where ${atribuido} and ${leads.status} = 'fechado'))::int`,
      perdidos: sql<number>`(count(*) filter (where ${atribuido} and ${leads.status} = 'perdido'))::int`,
    })
    .from(leads)
    .where(
      and(gte(leads.createdAt, period.from), lte(leads.createdAt, period.to), ...cb),
    );
  return {
    leads: Number(row?.leads ?? 0),
    mql: Number(row?.mql ?? 0),
    sql: Number(row?.sql ?? 0),
    desqualificados: Number(row?.desqualificados ?? 0),
    fechados: Number(row?.fechados ?? 0),
    perdidos: Number(row?.perdidos ?? 0),
  };
}

export type MqlSqlOrigemRow = {
  origem: string;
  leads: number;
  mql: number;
  sql: number;
  fechados: number;
  taxaAceite: number; // sql / mql — qualidade do lead
  winRate: number; // fechados / sql — eficiência de vendas
};

export const fetchMqlSqlPorOrigem = cache(async function fetchMqlSqlPorOrigem(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<MqlSqlOrigemRow[]> {
  return unstable_cache(
    () => fetchMqlSqlPorOrigemUncached(filters, period),
    cacheKeyFor("reports:mql-sql-origem", filters, period),
    { revalidate: REPORT_CACHE_TTL, tags: ["reports:dashboards"] },
  )();
});

async function fetchMqlSqlPorOrigemUncached(
  filters: ReportFilters,
  period: PeriodRange,
): Promise<MqlSqlOrigemRow[]> {
  const cb = baseConds(filters);
  const atribuido = sql`${leads.atribuidoEm} is not null`;
  const origemExpr = sql<string>`coalesce(nullif(${leads.origem}, ''), 'Sem origem')`;
  const rows = await db
    .select({
      origem: origemExpr,
      leads: sql<number>`count(*)::int`,
      mql: sql<number>`(count(*) filter (where ${atribuido}))::int`,
      sql: sql<number>`(count(*) filter (where ${atribuido} and ${leads.status} <> 'desqualificado'))::int`,
      fechados: sql<number>`(count(*) filter (where ${atribuido} and ${leads.status} = 'fechado'))::int`,
    })
    .from(leads)
    .where(
      and(gte(leads.createdAt, period.from), lte(leads.createdAt, period.to), ...cb),
    )
    .groupBy(origemExpr)
    .orderBy(sql`count(*) desc`)
    .limit(12);
  return rows.map((r) => {
    const mql = Number(r.mql);
    const sqlCount = Number(r.sql);
    const fechados = Number(r.fechados);
    return {
      origem: String(r.origem),
      leads: Number(r.leads),
      mql,
      sql: sqlCount,
      fechados,
      taxaAceite: mql > 0 ? sqlCount / mql : 0,
      winRate: sqlCount > 0 ? fechados / sqlCount : 0,
    };
  });
}
