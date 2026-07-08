import "server-only";

import { eq, sql } from "drizzle-orm";

import { leads } from "../../../db/schema";
import { cadenciaDoStatus } from "@/lib/cadencia/config";
import { proximaDataAposExecutar } from "@/lib/cadencia/tipos";
import { db } from "@/lib/db";

export { proximaDataAposExecutar };

// Motor da cadência de follow-up. Estado mínimo no lead (passo atual + quando
// vence + contadores); os passos vêm da cadencia_config. Filosofia: o sistema
// decide o próximo passo, o consultor executa em 1 toque — e travar, nunca.

/** Interação (cliente respondeu / consultor agiu fora da Mesa) → o próximo
 *  lembrete da cadência é empurrado pra daqui a N dias, sem mudar de passo. */
const REATIVACAO_DIAS = 2;

const DIA_MS = 24 * 60 * 60 * 1000;

function emDias(dias: number, aPartirDe: Date = new Date()): Date {
  return new Date(aPartirDe.getTime() + dias * DIA_MS);
}

/**
 * Inicia (ou reinicia) a cadência do status do lead. No-op se o status não tem
 * cadência ativa — nesse caso LIMPA o estado (lead saiu de um status com
 * cadência pra um sem).
 */
export async function iniciarCadencia(
  leadId: string,
  statusKey: string,
  opts?: { primeiraEm?: Date },
): Promise<boolean> {
  const cad = await cadenciaDoStatus(statusKey);
  if (!cad) {
    await encerrarCadencia(leadId);
    return false;
  }
  const agora = new Date();
  let primeira = opts?.primeiraEm ?? emDias(cad.passos[0]!.deltaDias, agora);
  if (!opts?.primeiraEm) {
    // Contato manual RECENTE (últimas 24h) → o 1º passo nasce reagendado
    // (+2d do contato, mesma convenção do reagendarPorInteracao). Sem isso,
    // registrar contato e mudar o status em seguida fazia a Mesa cobrar
    // "mande mensagem AGORA" pra um lead contactado minutos antes (caso
    // Heron). Fluxos que precisam do passo imediato (desfecho de reunião)
    // passam primeiraEm explícito.
    const [l] = await db
      .select({ ultimoContato: leads.ultimoContato })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    const DIA_MS = 24 * 60 * 60 * 1000;
    if (l?.ultimoContato && agora.getTime() - l.ultimoContato.getTime() < DIA_MS) {
      const aposContato = new Date(l.ultimoContato.getTime() + 2 * DIA_MS);
      if (aposContato > primeira) primeira = aposContato;
    }
  }
  await db
    .update(leads)
    .set({
      cadenciaPasso: 0,
      cadenciaProximaEm: primeira,
      cadenciaInicioEm: agora,
      cadenciaAdiamentos: 0,
      cadenciaPulos: 0,
    })
    .where(eq(leads.id, leadId));
  return true;
}

export async function encerrarCadencia(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({ cadenciaPasso: null, cadenciaProximaEm: null, cadenciaInicioEm: null })
    .where(eq(leads.id, leadId));
}

/** Hook de mudança de status (rota de status, desfecho de reunião, decisões). */
export async function aoMudarStatusCadencia(
  leadId: string,
  novoStatus: string,
  opts?: { primeiraEm?: Date },
): Promise<void> {
  try {
    await iniciarCadencia(leadId, novoStatus, opts);
  } catch (e) {
    console.error("[cadencia] aoMudarStatus falhou (não bloqueia):", e);
  }
}

/**
 * Interação real aconteceu (cliente respondeu no bot, consultor registrou
 * contato fora da Mesa) → conversa viva: empurra o próximo lembrete pra
 * +2 dias (se estava mais perto), sem mudar de passo. A cadência se adapta
 * ao trabalho real em vez de brigar com ele.
 */
export async function reagendarPorInteracao(leadId: string): Promise<void> {
  try {
    await db
      .update(leads)
      .set({
        cadenciaProximaEm: sql`greatest(${leads.cadenciaProximaEm}, now() + interval '${sql.raw(String(REATIVACAO_DIAS))} days')`,
      })
      .where(
        sql`${leads.id} = ${leadId} and ${leads.cadenciaPasso} is not null and ${leads.cadenciaProximaEm} is not null`,
      );
  } catch (e) {
    console.error("[cadencia] reagendar falhou (não bloqueia):", e);
  }
}

type LeadCadencia = {
  id: string;
  status: string;
  cadenciaPasso: number | null;
};

/** Avança pro próximo passo (após executar OU pular). */
export async function avancarPasso(
  lead: LeadCadencia,
  motivo: "executou" | "pulou",
): Promise<void> {
  const cad = await cadenciaDoStatus(lead.status);
  if (!cad || lead.cadenciaPasso == null) return;
  const prox = proximaDataAposExecutar(cad.passos, lead.cadenciaPasso);
  const patch: Record<string, unknown> = prox
    ? { cadenciaPasso: prox.proximoPasso, cadenciaProximaEm: prox.proximaEm }
    : // executou o penúltimo e não há próximo — mantém no passo (decisão é o último)
      {};
  if (motivo === "pulou") patch.cadenciaPulos = sql`${leads.cadenciaPulos} + 1`;
  if (Object.keys(patch).length === 0) return;
  await db.update(leads).set(patch).where(eq(leads.id, lead.id));
}

/** Adia o passo atual em 1 dia (contado — visível pro gestor). */
export async function adiarPasso(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({
      cadenciaProximaEm: sql`greatest(${leads.cadenciaProximaEm}, now()) + interval '1 day'`,
      cadenciaAdiamentos: sql`${leads.cadenciaAdiamentos} + 1`,
    })
    .where(eq(leads.id, leadId));
}

/** "Manter +7d" na decisão de fim de cadência (exige nota — cobrada na rota). */
export async function manterMaisSete(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({ cadenciaProximaEm: emDias(7) })
    .where(eq(leads.id, leadId));
}
