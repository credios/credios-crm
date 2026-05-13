import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  like,
  or,
  sql,
} from "drizzle-orm";

import {
  interacoes,
  leadAnotacoes,
  leads as leadsTable,
  users as usersTable,
} from "../../../db/schema";
import { db } from "@/lib/db";
import {
  resolveConsultor,
  resolveDateRange,
  resolveTipos,
  type AtividadesFilters,
} from "./filters";
import {
  type Atividade,
  type AtividadeTipo,
  type AtividadesKpi,
} from "./types";

// ============================================================================
// Map dos tipos do enum de DB → AtividadeTipo da UI
// ============================================================================
// interacoes.tipo é mais granular (whatsapp_enviado vs whatsapp_recebido).
// AtividadeTipo da UI consolida (whatsapp unificado).
//
// Simulação: detectada via tipo='evento_sistema' AND conteudo LIKE 'Simulação%'.
// Decisão pragmática — alternativa seria adicionar enum value dedicado, mas
// custo de migration + retroatividade pra ganho marginal.

const INTERACAO_TO_ATIVIDADE: Record<string, AtividadeTipo | null> = {
  ligacao: "ligacao",
  whatsapp_enviado: "whatsapp",
  whatsapp_recebido: "whatsapp",
  email: "email",
  reuniao: "reuniao",
  contato: "contato",
  documento_recebido: "documento_recebido",
  // Outros (mudanca_status, mudanca_atribuicao, evento_sistema) viram null
  // — não contam como atividade do consultor.
};

const SIMULACAO_PREFIX = "Simulação";

// ============================================================================
// listAtividades — main query
// ============================================================================

export async function listAtividades(filters: AtividadesFilters): Promise<Atividade[]> {
  const { from, to } = resolveDateRange(filters);
  const tiposFilter = resolveTipos(filters);
  const consultorId = resolveConsultor(filters);

  // Quais tipos de interação rodam na query 1 (não-anotação)?
  // Se filtro pede só "anotacao", pula a query 1 toda.
  // Se filtro pede só "simulacao", busca apenas evento_sistema com LIKE.
  const incluirInteracoes =
    !tiposFilter || tiposFilter.some((t) => t !== "anotacao");
  const incluirAnotacoes = !tiposFilter || tiposFilter.includes("anotacao");

  const [interacoesRows, anotacoesRows] = await Promise.all([
    incluirInteracoes
      ? queryInteracoes({ from, to, tiposFilter, consultorId })
      : Promise.resolve([] as InteracaoRow[]),
    incluirAnotacoes
      ? queryAnotacoes({ from, to, consultorId })
      : Promise.resolve([] as AnotacaoRow[]),
  ]);

  // Merge + sort no JS. Volume esperado: max ~10k rows em 30 dias com 10
  // consultores. Trivial pra sort em memória.
  const atividades: Atividade[] = [];

  for (const r of interacoesRows) {
    // Detecta simulação via prefixo do conteúdo
    const isSimulacao =
      r.tipo === "evento_sistema" &&
      (r.conteudo ?? "").startsWith(SIMULACAO_PREFIX);

    let atividadeTipo: AtividadeTipo | null;
    if (isSimulacao) atividadeTipo = "simulacao";
    else atividadeTipo = INTERACAO_TO_ATIVIDADE[r.tipo] ?? null;
    if (!atividadeTipo) continue; // ignora rows que não viram atividade

    atividades.push({
      id: `i:${r.id}`,
      source: "interacao",
      tipo: atividadeTipo,
      hora: r.criadoEm.toISOString(),
      consultor: { id: r.autorId!, nome: r.autorNome },
      lead: { id: r.leadId, nome: r.leadNome, status: r.leadStatus },
      titulo: null,
      detalhe: r.conteudo,
    });
  }

  for (const r of anotacoesRows) {
    atividades.push({
      id: `a:${r.id}`,
      source: "anotacao",
      tipo: "anotacao",
      hora: r.createdAt.toISOString(),
      consultor: { id: r.autorId!, nome: r.autorNome },
      lead: { id: r.leadId, nome: r.leadNome, status: r.leadStatus },
      titulo: r.titulo,
      detalhe: r.conteudo,
    });
  }

  // Sort cronológico reverso (mais recente em cima)
  atividades.sort((a, b) => b.hora.localeCompare(a.hora));

  return atividades;
}

// ============================================================================
// KPIs por consultor — agregação client-side a partir do array de atividades
// ============================================================================

export function computeKpis(atividades: Atividade[]): AtividadesKpi[] {
  const byConsultor = new Map<string, AtividadesKpi>();

  for (const a of atividades) {
    const key = a.consultor.id;
    let kpi = byConsultor.get(key);
    if (!kpi) {
      kpi = {
        consultorId: a.consultor.id,
        consultorNome: a.consultor.nome ?? "(sem nome)",
        total: 0,
        porTipo: {},
      };
      byConsultor.set(key, kpi);
    }
    kpi.total++;
    kpi.porTipo[a.tipo] = (kpi.porTipo[a.tipo] ?? 0) + 1;
  }

  // Ordena por total desc (consultor mais ativo primeiro)
  return Array.from(byConsultor.values()).sort((a, b) => b.total - a.total);
}

// ============================================================================
// Internal: query helpers (privados)
// ============================================================================

type InteracaoRow = {
  id: string;
  tipo: string;
  conteudo: string | null;
  criadoEm: Date;
  autorId: string | null;
  autorNome: string | null;
  leadId: string;
  leadNome: string;
  leadStatus: string;
};

async function queryInteracoes(opts: {
  from: Date;
  to: Date;
  tiposFilter: AtividadeTipo[] | null;
  consultorId: string | null;
}): Promise<InteracaoRow[]> {
  // Construímos a clause de filtro de tipo:
  //   - sem filtro: todos os tipos que viram atividade
  //   - filtro específico: só os enum values que mapeam pro tipo pedido
  //
  // O cast pra TipoInteracaoEnum é necessário pra Drizzle aceitar o inArray
  // com strings tipadas como literal union (string[] não satisfaz por
  // segurança de tipo do Postgres enum). Os valores são compile-time
  // verificáveis nos imports.
  type TipoEnum = (typeof interacoes.tipo)["_"]["data"];

  let tipoClause;
  if (!opts.tiposFilter) {
    // Todos os "atividade types" exceto "anotacao" (que é outra query)
    const allEnumValues: TipoEnum[] = [
      "ligacao",
      "whatsapp_enviado",
      "whatsapp_recebido",
      "email",
      "reuniao",
      "contato",
      "documento_recebido",
    ];
    tipoClause = or(
      inArray(interacoes.tipo, allEnumValues),
      and(
        eq(interacoes.tipo, "evento_sistema"),
        like(interacoes.conteudo, `${SIMULACAO_PREFIX}%`),
      ),
    );
  } else {
    // Tipos específicos — converte de AtividadeTipo pra enum values
    const enumValues: TipoEnum[] = [];
    let querSimulacao = false;
    for (const t of opts.tiposFilter) {
      if (t === "whatsapp") {
        enumValues.push("whatsapp_enviado", "whatsapp_recebido");
      } else if (t === "simulacao") {
        querSimulacao = true;
      } else if (t !== "anotacao") {
        enumValues.push(t as TipoEnum);
      }
    }

    const clauses = [];
    if (enumValues.length > 0) {
      clauses.push(inArray(interacoes.tipo, enumValues));
    }
    if (querSimulacao) {
      clauses.push(
        and(
          eq(interacoes.tipo, "evento_sistema"),
          like(interacoes.conteudo, `${SIMULACAO_PREFIX}%`),
        ),
      );
    }
    if (clauses.length === 0) {
      // Filtro pediu só "anotacao" — esta query nem deveria ter sido chamada
      return [];
    }
    tipoClause = clauses.length === 1 ? clauses[0] : or(...clauses);
  }

  const rows = await db
    .select({
      id: interacoes.id,
      tipo: interacoes.tipo,
      conteudo: interacoes.conteudo,
      criadoEm: interacoes.criadoEm,
      autorId: interacoes.autorId,
      autorNome: usersTable.nome,
      leadId: interacoes.leadId,
      leadNome: leadsTable.nome,
      leadStatus: leadsTable.status,
    })
    .from(interacoes)
    .innerJoin(usersTable, eq(usersTable.id, interacoes.autorId))
    .innerJoin(leadsTable, eq(leadsTable.id, interacoes.leadId))
    .where(
      and(
        gte(interacoes.criadoEm, opts.from),
        lt(interacoes.criadoEm, opts.to),
        isNotNull(interacoes.autorId),
        opts.consultorId ? eq(interacoes.autorId, opts.consultorId) : sql`TRUE`,
        tipoClause,
      ),
    )
    .orderBy(sql`${interacoes.criadoEm} DESC`)
    // Limite defensivo — pra periodos longos com muitos consultores. v1
    // não pagina (assumimos que admin filtra). 5k é teto razoável.
    .limit(5000);

  return rows as InteracaoRow[];
}

type AnotacaoRow = {
  id: string;
  titulo: string | null;
  conteudo: string;
  createdAt: Date;
  autorId: string | null;
  autorNome: string | null;
  leadId: string;
  leadNome: string;
  leadStatus: string;
};

async function queryAnotacoes(opts: {
  from: Date;
  to: Date;
  consultorId: string | null;
}): Promise<AnotacaoRow[]> {
  const rows = await db
    .select({
      id: leadAnotacoes.id,
      titulo: leadAnotacoes.titulo,
      conteudo: leadAnotacoes.conteudo,
      createdAt: leadAnotacoes.createdAt,
      autorId: leadAnotacoes.autorId,
      autorNome: usersTable.nome,
      leadId: leadAnotacoes.leadId,
      leadNome: leadsTable.nome,
      leadStatus: leadsTable.status,
    })
    .from(leadAnotacoes)
    .innerJoin(usersTable, eq(usersTable.id, leadAnotacoes.autorId))
    .innerJoin(leadsTable, eq(leadsTable.id, leadAnotacoes.leadId))
    .where(
      and(
        gte(leadAnotacoes.createdAt, opts.from),
        lt(leadAnotacoes.createdAt, opts.to),
        isNotNull(leadAnotacoes.autorId),
        opts.consultorId ? eq(leadAnotacoes.autorId, opts.consultorId) : sql`TRUE`,
      ),
    )
    .orderBy(sql`${leadAnotacoes.createdAt} DESC`)
    .limit(5000);

  return rows as AnotacaoRow[];
}
