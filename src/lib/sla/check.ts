// Não importa "server-only" diretamente porque queremos rodar este módulo
// também via tsx (smoke test, scripts). O `db` import já amarra ao Postgres,
// então não há risco real de uso em client.
import { and, eq, isNull, sql } from "drizzle-orm";

import { slaAlertas } from "../../../db/schema";
import { db } from "@/lib/db";
import { dentroHorarioComercial } from "@/lib/horario-comercial";

const SLA_PRIMEIRO_CONTATO_MINUTES = 30;

export type NewSlaAlert = {
  alertaId: string;
  leadId: string;
  leadNome: string;
  consultorId: string;
  atribuidoEm: Date | null;
};

export type SlaCheckResult = {
  evaluatedAt: Date;
  inBusinessHours: boolean;
  candidates: number;
  newAlerts: NewSlaAlert[];
};

/**
 * Avalia SLA `primeiro_contato_atrasado`. Idempotente em 2 níveis:
 *
 *   1. Filtro candidates já exclui leads com alerta ativo (LEFT JOIN +
 *      resolvido_em IS NULL).
 *   2. Defesa em profundidade: ÍNDICE ÚNICO PARCIAL `sla_alertas_unico_ativo`
 *      em (lead_id, tipo) WHERE resolvido_em IS NULL — aplicado via
 *      db/policies.sql. Isso garante que mesmo se 2 crons rodarem em paralelo
 *      (ou retry simultâneo), ON CONFLICT DO NOTHING evita duplicação.
 *
 * Trigger: lead status='novo' atribuído há mais de 30min E sem interação
 * manual nos últimos 30min E agora dentro do horário comercial.
 *
 * Performance: query única set-based (sem N+1). Computa todos os candidatos,
 * verifica última interação manual via subquery LATERAL, insere todos os
 * que faltam num só INSERT ... SELECT.
 */
export async function checkSlaPrimeiroContato(
  now: Date = new Date(),
): Promise<SlaCheckResult> {
  if (!dentroHorarioComercial(now)) {
    return { evaluatedAt: now, inBusinessHours: false, candidates: 0, newAlerts: [] };
  }

  const cutoff = new Date(now.getTime() - SLA_PRIMEIRO_CONTATO_MINUTES * 60_000);
  const cutoffIso = cutoff.toISOString();

  // Candidatos elegíveis = leads novos atribuídos antes do cutoff, sem
  // interação MANUAL após o cutoff e sem alerta ativo.
  const candidatesRows = await db.execute<{
    id: string;
    nome: string;
    consultor_id: string;
    atribuido_em: string;
  }>(sql.raw(`
    SELECT l.id, l.nome, l.consultor_id, l.atribuido_em::text
    FROM public.leads l
    WHERE l.status = 'novo'
      AND l.consultor_id IS NOT NULL
      AND l.atribuido_em <= '${cutoffIso}'
      AND NOT EXISTS (
        SELECT 1 FROM public.interacoes i
        WHERE i.lead_id = l.id
          AND i.tipo NOT IN ('mudanca_status', 'mudanca_atribuicao', 'evento_sistema')
          AND i.criado_em > '${cutoffIso}'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.sla_alertas s
        WHERE s.lead_id = l.id
          AND s.tipo = 'primeiro_contato_atrasado'
          AND s.resolvido_em IS NULL
      )
  `));

  if (candidatesRows.length === 0) {
    return { evaluatedAt: now, inBusinessHours: true, candidates: 0, newAlerts: [] };
  }

  // INSERT set-based com ON CONFLICT pelo índice parcial — se outra request
  // criar o alerta concorrentemente, pulamos silenciosamente.
  const values = candidatesRows
    .map((c) => `('${c.id}'::uuid, 'primeiro_contato_atrasado'::tipo_sla)`)
    .join(",");

  // ON CONFLICT (lead_id, tipo) WHERE resolvido_em IS NULL casa com o índice
  // único parcial `sla_alertas_unico_ativo` criado em db/policies.sql.
  const insertedRows = await db.execute<{
    id: string;
    lead_id: string;
  }>(sql.raw(`
    INSERT INTO public.sla_alertas (lead_id, tipo)
    VALUES ${values}
    ON CONFLICT (lead_id, tipo) WHERE resolvido_em IS NULL DO NOTHING
    RETURNING id, lead_id
  `));

  // Mapeia inserted → metadata pra retornar (preserva ordem original quando
  // possível pra notificação subsequente).
  const insertedById = new Map(insertedRows.map((r) => [r.lead_id, r.id]));
  const novos: NewSlaAlert[] = [];
  for (const c of candidatesRows) {
    const alertaId = insertedById.get(c.id);
    if (!alertaId) continue; // perdeu corrida vs outra request — OK
    novos.push({
      alertaId,
      leadId: c.id,
      leadNome: c.nome,
      consultorId: c.consultor_id,
      atribuidoEm: new Date(c.atribuido_em),
    });
  }

  return {
    evaluatedAt: now,
    inBusinessHours: true,
    candidates: candidatesRows.length,
    newAlerts: novos,
  };
}

/**
 * Resolve TODOS os alertas SLA ativos de um lead. Chamado quando uma interação
 * manual é registrada.
 */
export async function resolveSlaAlertsForLead(leadId: string): Promise<number> {
  const updated = await db
    .update(slaAlertas)
    .set({ resolvidoEm: sql`NOW()` })
    .where(
      and(eq(slaAlertas.leadId, leadId), isNull(slaAlertas.resolvidoEm)),
    )
    .returning({ id: slaAlertas.id });
  return updated.length;
}
