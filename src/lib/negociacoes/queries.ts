import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  interacoes,
  leadBancos,
  leads as leadsTable,
  users as usersTable,
} from "../../../db/schema";
import { db } from "@/lib/db";

// ============================================================================
// NEGOCIAÇÕES ABERTAS — leads em `em_negociacao` do consultor
// ============================================================================
// Página dedicada de fechamento: os leads com maior chance de virar receita.
// Cada item funde as três dimensões que o consultor precisa controlar todo dia:
//   1. Cliente   — valor + cadência de contato (semáforo 24/48h)
//   2. Operação  — há quanto tempo está em negociação
//   3. Banco     — status das propostas vinculadas (lead_bancos)
//
// "Meus" leads (consultorId = user.id), igual ao modelo da Minha Mesa.

/** Semáforo de cadência de contato com o cliente. Só visual. */
export type CadenciaNivel = "ok" | "atencao" | "urgente";

export type NegociacaoBanco = { banco: string; status: string };

export type NegociacaoAberta = {
  leadId: string;
  leadNome: string;
  whatsapp: string | null;
  status: string;
  valorCreditoCentavos: number | null;
  cidade: string | null;
  estado: string | null;
  origem: string | null;
  /** Consultor dono do lead (null = pool). Usado na visão "todos" do admin. */
  consultorNome: string | null;
  /** ISO; null se nunca houve contato registrado. */
  ultimoContato: string | null;
  horasSemContato: number | null;
  diasSemContato: number | null;
  cadencia: CadenciaNivel;
  /** ISO da última entrada em `em_negociacao` (via mudança de status). */
  entrouEmNegociacaoEm: string | null;
  diasEmNegociacao: number | null;
  bancos: NegociacaoBanco[];
};

const MS_HORA = 60 * 60 * 1000;
const MS_DIA = 24 * MS_HORA;

/** <24h em dia · 24–48h atenção · >48h (ou nunca) urgente. */
function nivelCadencia(ultimoContato: Date | null): CadenciaNivel {
  if (!ultimoContato) return "urgente";
  const horas = (Date.now() - ultimoContato.getTime()) / MS_HORA;
  if (horas < 24) return "ok";
  if (horas < 48) return "atencao";
  return "urgente";
}

const RANK: Record<CadenciaNivel, number> = {
  urgente: 0,
  atencao: 1,
  ok: 2,
};

/**
 * Negociações abertas. `consultorId`:
 *   - string → leads daquele consultor (uso padrão: o próprio usuário);
 *   - null   → TODOS os consultores (só admin, via seletor na página).
 */
export async function getNegociacoesAbertas(
  consultorId: string | null,
): Promise<NegociacaoAberta[]> {
  const conds = [eq(leadsTable.status, "em_negociacao")];
  if (consultorId) conds.push(eq(leadsTable.consultorId, consultorId));

  const rows = await db
    .select({
      leadId: leadsTable.id,
      leadNome: leadsTable.nome,
      whatsapp: leadsTable.whatsapp,
      status: leadsTable.status,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      cidade: leadsTable.cidade,
      estado: leadsTable.estado,
      origem: leadsTable.origem,
      ultimoContato: leadsTable.ultimoContato,
      consultorNome: usersTable.nome,
    })
    .from(leadsTable)
    .leftJoin(usersTable, eq(usersTable.id, leadsTable.consultorId))
    .where(and(...conds));

  if (rows.length === 0) return [];

  const leadIds = rows.map((r) => r.leadId);

  // Bancos por lead — uma query, agrupa no JS.
  const bancosRows = await db
    .select({
      leadId: leadBancos.leadId,
      banco: leadBancos.banco,
      status: leadBancos.status,
    })
    .from(leadBancos)
    .where(inArray(leadBancos.leadId, leadIds))
    .orderBy(leadBancos.banco);

  const bancosPorLead = new Map<string, NegociacaoBanco[]>();
  for (const b of bancosRows) {
    const arr = bancosPorLead.get(b.leadId) ?? [];
    arr.push({ banco: b.banco, status: b.status });
    bancosPorLead.set(b.leadId, arr);
  }

  // Quando entrou em negociação = último `mudanca_status` com para='em_negociacao'.
  const entradaRows = await db
    .select({
      leadId: interacoes.leadId,
      entrouEm: sql<string>`max(${interacoes.criadoEm})`,
    })
    .from(interacoes)
    .where(
      and(
        inArray(interacoes.leadId, leadIds),
        eq(interacoes.tipo, "mudanca_status"),
        sql`${interacoes.metadata} ->> 'para' = 'em_negociacao'`,
      ),
    )
    .groupBy(interacoes.leadId);

  const entradaPorLead = new Map<string, Date>();
  for (const e of entradaRows) {
    if (e.entrouEm) entradaPorLead.set(e.leadId, new Date(e.entrouEm));
  }

  const out: NegociacaoAberta[] = rows.map((r) => {
    const cadencia = nivelCadencia(r.ultimoContato);
    const horasSemContato = r.ultimoContato
      ? Math.floor((Date.now() - r.ultimoContato.getTime()) / MS_HORA)
      : null;
    const diasSemContato = r.ultimoContato
      ? Math.floor((Date.now() - r.ultimoContato.getTime()) / MS_DIA)
      : null;
    const entrou = entradaPorLead.get(r.leadId) ?? null;
    const diasEmNegociacao = entrou
      ? Math.floor((Date.now() - entrou.getTime()) / MS_DIA)
      : null;
    return {
      leadId: r.leadId,
      leadNome: r.leadNome,
      whatsapp: r.whatsapp,
      status: r.status,
      valorCreditoCentavos: r.valorCreditoCentavos,
      cidade: r.cidade,
      estado: r.estado,
      origem: r.origem,
      consultorNome: r.consultorNome,
      ultimoContato: r.ultimoContato ? r.ultimoContato.toISOString() : null,
      horasSemContato,
      diasSemContato,
      cadencia,
      entrouEmNegociacaoEm: entrou ? entrou.toISOString() : null,
      diasEmNegociacao,
      bancos: bancosPorLead.get(r.leadId) ?? [],
    };
  });

  // Ordenação:
  //   1. Cadência (semáforo): Falar hoje → Atenção → Em dia.
  //   2. Dentro do grupo: maior tempo sem contato primeiro (quem nunca teve
  //      contato registrado vai pro topo — Infinity).
  //   3. Desempate final: maior valor de crédito.
  const tempoSemContato = (it: NegociacaoAberta) =>
    it.horasSemContato == null ? Infinity : it.horasSemContato;
  out.sort(
    (a, b) =>
      RANK[a.cadencia] - RANK[b.cadencia] ||
      tempoSemContato(b) - tempoSemContato(a) ||
      (b.valorCreditoCentavos ?? 0) - (a.valorCreditoCentavos ?? 0),
  );

  return out;
}
