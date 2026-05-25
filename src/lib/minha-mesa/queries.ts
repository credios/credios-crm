import "server-only";

import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import {
  interacoes,
  leads as leadsTable,
  slaAlertas,
} from "../../../db/schema";
import { db } from "@/lib/db";
import { startOfDayBrt, todayYmdBrt } from "@/lib/datetime/brt";

// ============================================================================
// Tipos compartilhados
// ============================================================================

export type FilaItemTipo =
  | "sla_estourado"
  | "novo_hoje"
  | "docs_paradas"
  | "negociacao_parada"
  | "esfriando"
  | "alto_valor_parado";

export type FilaItem = {
  leadId: string;
  leadNome: string;
  whatsapp: string | null;
  status: string;
  origem: string | null;
  cidade: string | null;
  estado: string | null;
  valorCreditoCentavos: number | null;
  motivo: string;
  motivoTipo: FilaItemTipo;
  /** 0..100 — maior é mais urgente. */
  score: number;
};

const SCORE: Record<FilaItemTipo, number> = {
  sla_estourado: 100,
  novo_hoje: 85,
  docs_paradas: 80,
  negociacao_parada: 75,
  esfriando: 70,
  alto_valor_parado: 60,
};

const ALTO_VALOR_CENTAVOS = 30_000_000; // R$ 300.000
const STATUS_TERMINAIS = ["fechado", "perdido", "desqualificado"];

// ============================================================================
// FILA "FAZER AGORA" — leads priorizados por urgência
// ============================================================================

export async function getFilaFazerAgora(consultorId: string): Promise<FilaItem[]> {
  // 6 buckets em paralelo. Mesclamos no JS escolhendo o motivo de maior
  // prioridade por lead — evita o mesmo lead aparecer duas vezes.
  const [sla, novosHoje, docsParadas, negociacaoParada, esfriando, altoValorParado] =
    await Promise.all([
      qSlaEstourado(consultorId),
      qNovosHoje(consultorId),
      qDocsParadas(consultorId),
      qNegociacaoParada(consultorId),
      qEsfriando(consultorId),
      qAltoValorParado(consultorId),
    ]);

  const todos: FilaItem[] = [
    ...sla,
    ...novosHoje,
    ...docsParadas,
    ...negociacaoParada,
    ...esfriando,
    ...altoValorParado,
  ];

  const byLead = new Map<string, FilaItem>();
  for (const item of todos) {
    const ex = byLead.get(item.leadId);
    if (!ex || item.score > ex.score) byLead.set(item.leadId, item);
  }

  return Array.from(byLead.values())
    .sort((a, b) => b.score - a.score || (b.valorCreditoCentavos ?? 0) - (a.valorCreditoCentavos ?? 0))
    .slice(0, 30);
}

async function qSlaEstourado(consultorId: string): Promise<FilaItem[]> {
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(slaAlertas)
    .innerJoin(leadsTable, eq(leadsTable.id, slaAlertas.leadId))
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(slaAlertas.tipo, "primeiro_contato_atrasado"),
        isNull(slaAlertas.resolvidoEm),
      ),
    )
    .limit(20);
  return rows.map((r) => {
    const min = r.atribuidoEm
      ? Math.round((Date.now() - r.atribuidoEm.getTime()) / 60_000)
      : null;
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo:
        min != null
          ? `SLA estourado · sem 1º contato há ${formatTempoDecorrido(min)}`
          : "SLA estourado · sem 1º contato",
      motivoTipo: "sla_estourado",
      score: SCORE.sla_estourado,
    };
  });
}

async function qNovosHoje(consultorId: string): Promise<FilaItem[]> {
  const inicioDia = startOfDayBrt(todayYmdBrt());
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(leadsTable.status, "novo"),
        gte(leadsTable.atribuidoEm, inicioDia),
      ),
    )
    .orderBy(desc(leadsTable.atribuidoEm))
    .limit(30);
  return rows.map((r) => ({
    leadId: r.leadId,
    leadNome: r.leadNome,
    whatsapp: r.whatsapp,
    status: r.status,
    origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
    valorCreditoCentavos: r.valorCreditoCentavos,
    motivo: r.atribuidoEm
      ? `Novo · atribuído ${formatTempoDecorrido(Math.round((Date.now() - r.atribuidoEm.getTime()) / 60_000))} atrás`
      : "Novo · recebido hoje",
    motivoTipo: "novo_hoje",
    score: SCORE.novo_hoje,
  }));
}

async function qDocsParadas(consultorId: string): Promise<FilaItem[]> {
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(leadsTable.status, "aguardando_documentacao"),
        or(
          isNull(leadsTable.ultimoContato),
          lt(leadsTable.ultimoContato, sql`now() - interval '5 days'`),
        ),
      ),
    )
    .limit(20);
  return rows.map((r) => {
    const dias = r.ultimoContato
      ? Math.round((Date.now() - r.ultimoContato.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo:
        dias != null
          ? `Aguardando documentação há ${dias}d sem contato`
          : "Aguardando documentação · sem contato registrado",
      motivoTipo: "docs_paradas",
      score: SCORE.docs_paradas,
    };
  });
}

async function qNegociacaoParada(consultorId: string): Promise<FilaItem[]> {
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
      updatedAt: leadsTable.updatedAt,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(leadsTable.status, "em_negociacao"),
        lt(leadsTable.updatedAt, sql`now() - interval '5 days'`),
      ),
    )
    .limit(20);
  return rows.map((r) => {
    const dias = Math.round(
      (Date.now() - r.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo: `Em negociação parada há ${dias}d`,
      motivoTipo: "negociacao_parada",
      score: SCORE.negociacao_parada,
    };
  });
}

async function qEsfriando(consultorId: string): Promise<FilaItem[]> {
  // Status ativos não-novos sem contato há 5+ dias (novo já tá em SLA/novosHoje).
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        notInArray(leadsTable.status, [
          ...STATUS_TERMINAIS,
          "novo",
          "aguardando_documentacao",
          "em_negociacao",
        ]),
        or(
          isNull(leadsTable.ultimoContato),
          lt(leadsTable.ultimoContato, sql`now() - interval '5 days'`),
        ),
      ),
    )
    .limit(30);
  return rows.map((r) => {
    const dias = r.ultimoContato
      ? Math.round((Date.now() - r.ultimoContato.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo:
        dias != null
          ? `Sem contato há ${dias}d`
          : "Sem contato registrado",
      motivoTipo: "esfriando",
      score: SCORE.esfriando,
    };
  });
}

async function qAltoValorParado(consultorId: string): Promise<FilaItem[]> {
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        gte(leadsTable.valorCreditoCentavos, ALTO_VALOR_CENTAVOS),
        notInArray(leadsTable.status, STATUS_TERMINAIS),
        or(
          and(
            isNull(leadsTable.ultimoContato),
            lt(leadsTable.atribuidoEm, sql`now() - interval '3 days'`),
          ),
          lt(leadsTable.ultimoContato, sql`now() - interval '3 days'`),
        ),
      ),
    )
    .limit(20);
  return rows.map((r) => {
    const valorMi = r.valorCreditoCentavos
      ? (r.valorCreditoCentavos / 100_000_000).toFixed(1)
      : "?";
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      valorCreditoCentavos: r.valorCreditoCentavos,
      motivo: `Alto valor parado (R$ ${valorMi} mi)`,
      motivoTipo: "alto_valor_parado",
      score: SCORE.alto_valor_parado,
    };
  });
}

// ============================================================================
// NOVOS PARA MIM — leads atribuídos nas últimas 24h
// ============================================================================

export type NovoParaMim = {
  leadId: string;
  leadNome: string;
  valorCreditoCentavos: number | null;
  whatsapp: string | null;
  origem: string | null;
  cidade: string | null;
  estado: string | null;
  atribuidoEm: Date;
  /** Minutos desde a atribuição. */
  minutosDesdeAtribuicao: number;
  /** 0..100 — quanto do SLA de 30min já passou. >100 = estourado. */
  slaPercentDecorrido: number;
};

export async function getNovosParaMim(
  consultorId: string,
): Promise<NovoParaMim[]> {
  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      whatsapp: leadsTable.whatsapp,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        eq(leadsTable.status, "novo"),
        gte(leadsTable.atribuidoEm, desde24h),
      ),
    )
    .orderBy(desc(leadsTable.atribuidoEm))
    .limit(20);

  return rows
    .filter((r): r is typeof r & { atribuidoEm: Date } => r.atribuidoEm != null)
    .map((r) => {
      const min = Math.round((Date.now() - r.atribuidoEm.getTime()) / 60_000);
      return {
        leadId: r.leadId,
        leadNome: r.leadNome,
        valorCreditoCentavos: r.valorCreditoCentavos,
        whatsapp: r.whatsapp,
        origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
        atribuidoEm: r.atribuidoEm,
        minutosDesdeAtribuicao: min,
        slaPercentDecorrido: Math.min(200, Math.round((min / 30) * 100)),
      };
    });
}

// ============================================================================
// CARTEIRA EM RISCO — leads com chance alta de esfriar
// ============================================================================

export type CarteiraEmRisco = {
  leadId: string;
  leadNome: string;
  valorCreditoCentavos: number | null;
  status: string;
  origem: string | null;
  cidade: string | null;
  estado: string | null;
  ultimoContato: Date | null;
  diasSemContato: number;
  motivo: string;
};

export async function getCarteiraEmRisco(
  consultorId: string,
): Promise<CarteiraEmRisco[]> {
  // Status ativos sem contato há 7+ dias. Limita 30.
  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      status: leadsTable.status,
      origem: leadsTable.origem,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      ultimoContato: leadsTable.ultimoContato,
      atribuidoEm: leadsTable.atribuidoEm,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, consultorId),
        notInArray(leadsTable.status, STATUS_TERMINAIS),
        or(
          isNull(leadsTable.ultimoContato),
          lt(leadsTable.ultimoContato, sql`now() - interval '7 days'`),
        ),
        // Não mostrar leads novos sem contato — eles vão pra "novos pra mim"
        sql`${leadsTable.status} != 'novo'`,
      ),
    )
    .orderBy(desc(leadsTable.valorCreditoCentavos))
    .limit(30);

  return rows.map((r) => {
    const ref = r.ultimoContato ?? r.atribuidoEm;
    const dias = ref
      ? Math.round((Date.now() - ref.getTime()) / (24 * 60 * 60 * 1000))
      : 999;
    let motivo: string;
    if (r.status === "aguardando_documentacao")
      motivo = `Aguardando docs · ${dias}d sem contato`;
    else if (r.status === "em_negociacao")
      motivo = `Negociação parada · ${dias}d`;
    else motivo = `${dias}d sem contato`;
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      valorCreditoCentavos: r.valorCreditoCentavos,
      status: r.status,
      origem: r.origem,
      cidade: r.cidade,
      estado: r.estado,
      ultimoContato: r.ultimoContato,
      diasSemContato: dias,
      motivo,
    };
  });
}

// ============================================================================
// MINI PLACAR DO DIA
// ============================================================================

export type MiniPlacar = {
  leadsNovosRecebidos24h: number;
  leadsContatadosHoje: number;
  slaPendente: number;
  pipelineAtivoCentavos: number;
};

export async function getMiniPlacar(consultorId: string): Promise<MiniPlacar> {
  const inicioDia = startOfDayBrt(todayYmdBrt());
  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [[novos24hRow], [contatadosHojeRow], [slaRow], [pipelineRow]] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.consultorId, consultorId),
            gte(leadsTable.atribuidoEm, desde24h),
          ),
        ),
      db
        .select({
          count: sql<number>`count(distinct ${interacoes.leadId})::int`,
        })
        .from(interacoes)
        .where(
          and(
            eq(interacoes.autorId, consultorId),
            gte(interacoes.criadoEm, inicioDia),
            notInArray(interacoes.tipo, [
              "mudanca_status",
              "mudanca_atribuicao",
              "evento_sistema",
            ]),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(slaAlertas)
        .innerJoin(leadsTable, eq(leadsTable.id, slaAlertas.leadId))
        .where(
          and(
            eq(leadsTable.consultorId, consultorId),
            eq(slaAlertas.tipo, "primeiro_contato_atrasado"),
            isNull(slaAlertas.resolvidoEm),
          ),
        ),
      db
        .select({
          valor: sql<string>`coalesce(sum(${leadsTable.valorCreditoCentavos}), 0)::text`,
        })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.consultorId, consultorId),
            notInArray(leadsTable.status, STATUS_TERMINAIS),
          ),
        ),
    ]);

  return {
    leadsNovosRecebidos24h: novos24hRow.count,
    leadsContatadosHoje: contatadosHojeRow.count,
    slaPendente: slaRow.count,
    pipelineAtivoCentavos: Number(pipelineRow.valor ?? 0),
  };
}

// ============================================================================
// helpers
// ============================================================================

function formatTempoDecorrido(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}h${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
