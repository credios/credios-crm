import "server-only";

import { and, asc, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import {
  interacoes,
  leadBancos,
  leads,
  tarefas,
  taskConfigPorStatus,
  users as usersTable,
} from "../../../db/schema";
import { ACAO_TAREFA_LABEL } from "@/lib/constants";
import {
  endOfBusinessDayBrt,
  isBusinessDayBrt,
  previousBusinessDayYmdBrt,
  todayYmdBrt,
} from "@/lib/datetime/brt";
import { db } from "@/lib/db";
import { resolveSlaAlertsForLead } from "@/lib/sla/check";
import type { CompleteTaskInput } from "@/lib/validators/task";

import {
  TASK_ACTIVE_STATUS_EXCLUDED,
  type TaskRowForList,
  type TaskStatus,
} from "./types";

export type GenerateTasksResult = {
  businessDay: boolean;
  dataReferencia: string;
  created: number;
  carriedOpen: number;
};

type TaskConfigRow = {
  statusKey: string;
  ativo: boolean;
  titulo: string;
  descricao: string | null;
  frequenciaDias: number;
};

/** Mapa key->config (somente ativos). */
async function loadActiveTaskConfigs(): Promise<Map<string, TaskConfigRow>> {
  const rows = await db
    .select({
      statusKey: taskConfigPorStatus.statusKey,
      ativo: taskConfigPorStatus.ativo,
      titulo: taskConfigPorStatus.titulo,
      descricao: taskConfigPorStatus.descricao,
      frequenciaDias: taskConfigPorStatus.frequenciaDias,
    })
    .from(taskConfigPorStatus)
    .where(eq(taskConfigPorStatus.ativo, true));
  const map = new Map<string, TaskConfigRow>();
  for (const r of rows) map.set(r.statusKey, r);
  return map;
}

export async function markOverdueTasks(now: Date = new Date()): Promise<number> {
  // `lt(tarefas.venceEm, now)` em vez de sql template literal — o postgres-js
  // não converte Date pra parâmetro automaticamente quando vem via raw template
  // (joga TypeError ERR_INVALID_ARG_TYPE em runtime). A função `lt` do Drizzle
  // serializa o Date corretamente como timestamp.
  const updated = await db
    .update(tarefas)
    .set({ status: "atrasada" })
    .where(and(eq(tarefas.status, "aberta"), lt(tarefas.venceEm, now)))
    .returning({ id: tarefas.id });
  return updated.length;
}

export async function generateDailyTasks(
  now: Date = new Date(),
): Promise<GenerateTasksResult> {
  const dataReferencia = todayYmdBrt(now);
  if (!isBusinessDayBrt(now)) {
    return { businessDay: false, dataReferencia, created: 0, carriedOpen: 0 };
  }

  await markOverdueTasks(now);
  const venceEm = endOfBusinessDayBrt(dataReferencia);

  const activeBefore = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tarefas)
    .where(inArray(tarefas.status, ["aberta", "atrasada"]));

  const configs = await loadActiveTaskConfigs();
  if (configs.size === 0) {
    return {
      businessDay: true,
      dataReferencia,
      created: 0,
      carriedOpen: activeBefore[0]?.count ?? 0,
    };
  }
  const activeStatusKeys = Array.from(configs.keys());

  // Busca leads candidatos: tem config ativa pro status, sem tarefa aberta,
  // E última tarefa (qualquer status) >= frequencia_dias atrás (ou nunca teve).
  // Frequência conta dias de calendário — cron só roda em dias úteis, então
  // a janela equivale a "frequência dias úteis" pra leads com tarefa diária
  // contínua, e segura bem casos com gaps de fim de semana.
  const rows = await db
    .select({
      id: leads.id,
      status: leads.status,
      consultorId: leads.consultorId,
      lastTaskDate: sql<string | null>`(
        SELECT MAX(t.data_referencia)::text FROM public.tarefas t
        WHERE t.lead_id = ${leads.id}
      )`,
    })
    .from(leads)
    .innerJoin(usersTable, eq(usersTable.id, leads.consultorId))
    .where(
      and(
        sql`${leads.consultorId} IS NOT NULL`,
        eq(usersTable.ativo, true),
        // Excludidos sistema (terminais) — double-check: configs ativas dos
        // terminais também filtraria, mas o array TASK_ACTIVE_STATUS_EXCLUDED
        // protege caso admin reative tarefa em status terminal sistema.
        notInArray(leads.status, [...TASK_ACTIVE_STATUS_EXCLUDED]),
        inArray(leads.status, activeStatusKeys),
        sql`NOT EXISTS (
          SELECT 1 FROM public.tarefas t
          WHERE t.lead_id = ${leads.id}
            AND t.status IN ('aberta', 'atrasada')
        )`,
      ),
    );

  // Filtragem por frequência feita em app — Postgres date math entre
  // colunas computadas + config dinâmica fica feio em SQL puro.
  const todayMs = new Date(dataReferencia + "T00:00:00Z").getTime();
  const dueLeads = rows.filter((r) => {
    const cfg = configs.get(r.status);
    if (!cfg) return false;
    if (!r.lastTaskDate) return true;
    const lastMs = new Date(r.lastTaskDate + "T00:00:00Z").getTime();
    const diffDays = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24));
    return diffDays >= cfg.frequenciaDias;
  });

  if (dueLeads.length === 0) {
    return {
      businessDay: true,
      dataReferencia,
      created: 0,
      carriedOpen: activeBefore[0]?.count ?? 0,
    };
  }

  const inserted = await db
    .insert(tarefas)
    .values(
      dueLeads
        .filter((r) => r.consultorId)
        .map((r) => {
          const cfg = configs.get(r.status)!;
          return {
            leadId: r.id,
            consultorId: r.consultorId!,
            tipo: "contato_diario" as const,
            titulo: cfg.titulo,
            descricao: cfg.descricao,
            dataReferencia,
            venceEm,
          };
        }),
    )
    .onConflictDoNothing()
    .returning({ id: tarefas.id });

  return {
    businessDay: true,
    dataReferencia,
    created: inserted.length,
    carriedOpen: activeBefore[0]?.count ?? 0,
  };
}

export async function listTasksForUser(options: {
  userId: string;
  perfil: string;
  status?: TaskStatus | "todas";
  consultorId?: string;
  data?: string;
}): Promise<TaskRowForList[]> {
  const conds = [];
  if (options.perfil === "consultor") {
    conds.push(eq(tarefas.consultorId, options.userId));
  } else if (options.consultorId) {
    conds.push(eq(tarefas.consultorId, options.consultorId));
  }
  if (options.status && options.status !== "todas") {
    conds.push(eq(tarefas.status, options.status));
  }
  if (options.data) {
    conds.push(eq(tarefas.dataReferencia, options.data));
  }

  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: tarefas.id,
      leadId: tarefas.leadId,
      leadNome: leads.nome,
      leadStatus: leads.status,
      consultorId: tarefas.consultorId,
      consultorNome: usersTable.nome,
      titulo: tarefas.titulo,
      descricao: tarefas.descricao,
      status: tarefas.status,
      dataReferencia: tarefas.dataReferencia,
      venceEm: tarefas.venceEm,
      concluidaEm: tarefas.concluidaEm,
      acaoConclusao: tarefas.acaoConclusao,
      observacaoConclusao: tarefas.observacaoConclusao,
      valorCreditoCentavos: leads.valorCreditoCentavos,
      origem: leads.origem,
      createdAt: tarefas.createdAt,
    })
    .from(tarefas)
    .innerJoin(leads, eq(leads.id, tarefas.leadId))
    .innerJoin(usersTable, eq(usersTable.id, tarefas.consultorId))
    .where(where)
    .orderBy(
      sql`CASE ${tarefas.status} WHEN 'atrasada' THEN 0 WHEN 'aberta' THEN 1 ELSE 2 END`,
      asc(tarefas.venceEm),
      desc(tarefas.createdAt),
    )
    .limit(300);

  return rows as TaskRowForList[];
}

export async function getTaskWithLead(taskId: string) {
  const [row] = await db
    .select({
      id: tarefas.id,
      leadId: tarefas.leadId,
      consultorId: tarefas.consultorId,
      status: tarefas.status,
      titulo: tarefas.titulo,
      leadNome: leads.nome,
      leadStatus: leads.status,
    })
    .from(tarefas)
    .innerJoin(leads, eq(leads.id, tarefas.leadId))
    .where(eq(tarefas.id, taskId))
    .limit(1);
  return row ?? null;
}

export async function completeTask(
  taskId: string,
  userId: string,
  input: CompleteTaskInput,
) {
  const task = await getTaskWithLead(taskId);
  if (!task) return null;
  if (task.status === "concluida") return task;

  const now = new Date();
  const actionLabel = ACAO_TAREFA_LABEL[input.acao] ?? input.acao;
  const obs = input.observacao?.trim() || null;
  const conteudo = [
    `Tarefa concluída: ${task.titulo}`,
    `Ação realizada: ${actionLabel}`,
    obs ? `Observação: ${obs}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await db.transaction(async (tx) => {
    await tx
      .update(tarefas)
      .set({
        status: "concluida",
        concluidaEm: now,
        concluidaPor: userId,
        acaoConclusao: input.acao,
        observacaoConclusao: obs,
      })
      .where(eq(tarefas.id, taskId));

    await tx.insert(interacoes).values({
      leadId: task.leadId,
      autorId: userId,
      tipo: "anotacao",
      conteudo,
      metadata: {
        tarefaId: taskId,
        acao: input.acao,
        acaoLabel: actionLabel,
      } as never,
      criadoEm: now,
    });

    await tx.update(leads).set({ ultimoContato: now }).where(eq(leads.id, task.leadId));
  });

  await resolveSlaAlertsForLead(task.leadId);
  return task;
}

export async function taskStatsByConsultor(dataReferencia?: string) {
  // Cacheado: chamada do dashboard /relatorios pelo perfil admin/gerente.
  // Lê tarefas + JOIN users + 4 aggregates filter — pesado em pico se chamado
  // junto com outras 8+ Suspenses. TTL 120s.
  return unstable_cache(
    () => taskStatsByConsultorUncached(dataReferencia),
    ["tasks:stats-by-consultor", dataReferencia ?? "all"],
    { revalidate: 120, tags: ["tasks:dashboards"] },
  )();
}

async function taskStatsByConsultorUncached(dataReferencia?: string) {
  const cond = dataReferencia ? eq(tarefas.dataReferencia, dataReferencia) : undefined;
  return await db
    .select({
      consultorId: tarefas.consultorId,
      consultorNome: usersTable.nome,
      total: sql<number>`count(*)::int`,
      abertas: sql<number>`count(*) filter (where ${tarefas.status} = 'aberta')::int`,
      atrasadas: sql<number>`count(*) filter (where ${tarefas.status} = 'atrasada')::int`,
      concluidas: sql<number>`count(*) filter (where ${tarefas.status} = 'concluida')::int`,
    })
    .from(tarefas)
    .innerJoin(usersTable, eq(usersTable.id, tarefas.consultorId))
    .where(cond)
    .groupBy(tarefas.consultorId, usersTable.nome)
    .orderBy(usersTable.nome);
}

export async function listConsultoresWithTasks() {
  return await db
    .selectDistinct({ id: usersTable.id, nome: usersTable.nome })
    .from(usersTable)
    .innerJoin(tarefas, eq(tarefas.consultorId, usersTable.id))
    .orderBy(usersTable.nome);
}

/**
 * Tarefas concluídas no dia (BRT). Pra dashboard admin: visão de quem
 * efetivamente trabalhou hoje, com qual ação e em qual lead.
 *
 * Sem filtro de consultor — chamada apenas pelo perfil admin/gerente em
 * /tarefas. Retorno ordenado: consultor (nome) → concluída_em DESC pra cada um.
 */
export async function listCompletedTasksToday(
  dataReferencia: string = todayYmdBrt(),
): Promise<TaskRowForList[]> {
  const rows = await db
    .select({
      id: tarefas.id,
      leadId: tarefas.leadId,
      leadNome: leads.nome,
      leadStatus: leads.status,
      consultorId: tarefas.consultorId,
      consultorNome: usersTable.nome,
      titulo: tarefas.titulo,
      descricao: tarefas.descricao,
      status: tarefas.status,
      dataReferencia: tarefas.dataReferencia,
      venceEm: tarefas.venceEm,
      concluidaEm: tarefas.concluidaEm,
      acaoConclusao: tarefas.acaoConclusao,
      observacaoConclusao: tarefas.observacaoConclusao,
      valorCreditoCentavos: leads.valorCreditoCentavos,
      origem: leads.origem,
      createdAt: tarefas.createdAt,
    })
    .from(tarefas)
    .innerJoin(leads, eq(leads.id, tarefas.leadId))
    .innerJoin(usersTable, eq(usersTable.id, tarefas.consultorId))
    .where(
      and(
        eq(tarefas.status, "concluida"),
        eq(tarefas.dataReferencia, dataReferencia),
      ),
    )
    .orderBy(usersTable.nome, desc(tarefas.concluidaEm));
  return rows as TaskRowForList[];
}

export async function yesterdayNewUnmovedLeadsByConsultor() {
  const previous = previousBusinessDayYmdBrt();
  const rows = await db.execute<{
    consultor_id: string;
    lead_id: string;
    lead_nome: string;
    valor_credito_centavos: string | null;
  }>(sql.raw(`
    SELECT
      l.consultor_id,
      l.id AS lead_id,
      l.nome AS lead_nome,
      l.valor_credito_centavos::text
    FROM public.leads l
    WHERE l.consultor_id IS NOT NULL
      AND l.created_at >= '${previous}T00:00:00-03:00'::timestamptz
      AND l.created_at <= '${previous}T23:59:59.999-03:00'::timestamptz
      AND l.status = 'novo'
  `));
  return rows;
}

export async function activeLeadsWithoutOpenTaskCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(sql`
      ${leads.consultorId} IS NOT NULL
      AND ${leads.status} NOT IN ('fechado','perdido','desqualificado','sem_resposta')
      AND NOT EXISTS (
        SELECT 1 FROM public.tarefas t
        WHERE t.lead_id = ${leads.id}
          AND t.status IN ('aberta','atrasada')
      )
    `);
  return row?.count ?? 0;
}

export async function listLeadBancos(leadId: string) {
  return await db
    .select()
    .from(leadBancos)
    .where(eq(leadBancos.leadId, leadId))
    .orderBy(asc(leadBancos.banco));
}

export async function ensureBancoInteracao(params: {
  leadId: string;
  userId: string;
  banco: string;
  status: string;
  observacoes?: string | null;
}) {
  await db.insert(interacoes).values({
    leadId: params.leadId,
    autorId: params.userId,
    tipo: "evento_sistema",
    conteudo: `Banco/proposta atualizado: ${params.banco} (${params.status})`,
    metadata: {
      banco: params.banco,
      status: params.status,
      observacoes: params.observacoes ?? null,
    } as never,
  });
}

export function isLeadBankStage(status: string): boolean {
  return status === "documentacao_enviada" || status === "em_negociacao";
}

export async function hasLeadBanks(leadId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: leadBancos.id })
    .from(leadBancos)
    .where(eq(leadBancos.leadId, leadId))
    .limit(1);
  return Boolean(row);
}
