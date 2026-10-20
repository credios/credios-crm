import "server-only";

import { and, eq, ne } from "drizzle-orm";

import {
  duplicidadesPendentes,
  leadCondominio,
  parceiros,
} from "../../../db/schema";
import { db } from "@/lib/db";

type CamposCondominio = Partial<
  Omit<typeof leadCondominio.$inferInsert, "leadId" | "createdAt" | "updatedAt">
>;

/**
 * Cria ou atualiza a linha de `lead_condominio`. Só toca nas colunas
 * presentes em `campos` — PATCH parcial não apaga o resto.
 */
export async function salvarCondominio(
  leadId: string,
  campos: CamposCondominio,
  /** Transação em curso, quando o chamador grava o lead junto. */
  executor: Pick<typeof db, "insert"> = db,
): Promise<void> {
  await executor
    .insert(leadCondominio)
    .values({ leadId, ...campos })
    .onConflictDoUpdate({
      target: leadCondominio.leadId,
      // `updatedAt` garante que o SET nunca fica vazio (Drizzle lança
      // "No values to set" quando `campos` vem {}).
      set: { ...campos, updatedAt: new Date() },
    });
}

export async function buscarCondominio(leadId: string) {
  const [row] = await db
    .select()
    .from(leadCondominio)
    .where(eq(leadCondominio.leadId, leadId))
    .limit(1);
  return row ?? null;
}

/**
 * Mesmo CNPJ em outro lead → registra em `duplicidades_pendentes` pra revisão
 * (não bloqueia, igual ao CPF no CGI). A coluna `cpf` da tabela guarda o
 * documento, aqui o CNPJ. Devolve o id do lead já existente, se houver.
 */
export async function registrarDuplicidadeCnpj(
  leadId: string,
  cnpj: string | null | undefined,
): Promise<string | null> {
  if (!cnpj) return null;
  const [outro] = await db
    .select({ leadId: leadCondominio.leadId })
    .from(leadCondominio)
    .where(and(eq(leadCondominio.cnpj, cnpj), ne(leadCondominio.leadId, leadId)))
    .limit(1);
  if (!outro) return null;
  await db.insert(duplicidadesPendentes).values({
    novoLeadId: leadId,
    leadExistenteId: outro.leadId,
    cpf: cnpj,
  });
  return outro.leadId;
}

/**
 * Nome de exibição do parceiro indicador — espelhado em `leads.parceiro_nome`.
 * Com `produto`, só devolve se o parceiro estiver habilitado nele.
 */
export async function nomeDoParceiro(
  parceiroId: string,
  produto?: string,
): Promise<string | null> {
  const [p] = await db
    .select({
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      produtosHabilitados: parceiros.produtosHabilitados,
    })
    .from(parceiros)
    .where(eq(parceiros.id, parceiroId))
    .limit(1);
  if (!p) return null;
  if (produto && !p.produtosHabilitados.includes(produto)) return null;
  return p.empresa ? `${p.nome} (${p.empresa})` : p.nome;
}
