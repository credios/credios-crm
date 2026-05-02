// Não importa "server-only" diretamente porque queremos rodar este módulo
// também via tsx (smoke test, scripts). O `db` import já amarra ao Postgres,
// então não há risco real de uso em client.
import { and, eq, isNull, max, notInArray, sql } from "drizzle-orm";

import {
  interacoes,
  leads,
  slaAlertas,
} from "../../../db/schema";
import { db } from "@/lib/db";
import { dentroHorarioComercial } from "@/lib/horario-comercial";

const SLA_PRIMEIRO_CONTATO_MINUTES = 30;

const SISTEMA_TIPOS: Array<"mudanca_status" | "mudanca_atribuicao" | "evento_sistema"> = [
  "mudanca_status",
  "mudanca_atribuicao",
  "evento_sistema",
];

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
 * Avalia SLA `primeiro_contato_atrasado`. Idempotente: só cria alerta se não
 * existe um ativo (resolvido_em IS NULL) pro lead.
 *
 * Trigger: lead status='novo' atribuído há mais de 30min E sem interação
 * manual nos últimos 30min E agora dentro do horário comercial.
 */
export async function checkSlaPrimeiroContato(
  now: Date = new Date(),
): Promise<SlaCheckResult> {
  if (!dentroHorarioComercial(now)) {
    return { evaluatedAt: now, inBusinessHours: false, candidates: 0, newAlerts: [] };
  }

  const cutoff = new Date(now.getTime() - SLA_PRIMEIRO_CONTATO_MINUTES * 60_000);

  // Candidatos: status=novo, com consultor atribuído, atribuídos antes do cutoff.
  const candidates = await db
    .select({
      id: leads.id,
      nome: leads.nome,
      consultorId: leads.consultorId,
      atribuidoEm: leads.atribuidoEm,
    })
    .from(leads)
    .where(
      and(
        eq(leads.status, "novo"),
        sql`${leads.consultorId} IS NOT NULL`,
        sql`${leads.atribuidoEm} <= ${cutoff.toISOString()}`,
      ),
    );

  const novos: NewSlaAlert[] = [];

  for (const lead of candidates) {
    if (!lead.consultorId || !lead.atribuidoEm) continue;

    // Última interação manual (não-sistema) nesse lead.
    const [{ ultima }] = await db
      .select({ ultima: max(interacoes.criadoEm) })
      .from(interacoes)
      .where(
        and(
          eq(interacoes.leadId, lead.id),
          notInArray(interacoes.tipo, SISTEMA_TIPOS),
        ),
      );

    const timeRef = ultima && ultima > lead.atribuidoEm ? ultima : lead.atribuidoEm;
    if (timeRef > cutoff) continue; // ainda dentro do prazo de 30min

    // Já tem alerta ativo?
    const [existing] = await db
      .select({ id: slaAlertas.id })
      .from(slaAlertas)
      .where(
        and(
          eq(slaAlertas.leadId, lead.id),
          eq(slaAlertas.tipo, "primeiro_contato_atrasado"),
          isNull(slaAlertas.resolvidoEm),
        ),
      )
      .limit(1);
    if (existing) continue;

    const [created] = await db
      .insert(slaAlertas)
      .values({
        leadId: lead.id,
        tipo: "primeiro_contato_atrasado",
      })
      .returning({ id: slaAlertas.id });

    novos.push({
      alertaId: created.id,
      leadId: lead.id,
      leadNome: lead.nome,
      consultorId: lead.consultorId,
      atribuidoEm: lead.atribuidoEm,
    });
  }

  return {
    evaluatedAt: now,
    inBusinessHours: true,
    candidates: candidates.length,
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
