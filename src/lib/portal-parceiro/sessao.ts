import "server-only";

import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { parceiroSessoes, parceiroUsuarios, parceiros } from "../../../db/schema";
import { db } from "@/lib/db";

import { gerarToken, hashToken } from "./tokens";

// Sessão do portal do parceiro. Cookie opaco (32 bytes aleatórios) → SHA-256
// na tabela `parceiro_sessoes`. Sem JWT de propósito: suspender o parceiro ou
// trocar a senha derruba a sessão na hora (basta apagar as linhas).

export const COOKIE_SESSAO = "cp_sessao";
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias, igual ao portal antigo

export const ROTA_ENTRAR = "/portal-parceiro/entrar";

export type ParceiroSessao = {
  usuarioId: string;
  parceiroId: string;
  nome: string;
  email: string;
  parceiroNome: string;
  produtosHabilitados: string[];
};

export async function criarSessao(
  usuarioId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const { token, hash } = gerarToken();
  const expiraEm = new Date(Date.now() + DURACAO_MS);
  await db.insert(parceiroSessoes).values({
    usuarioId,
    tokenHash: hash,
    expiraEm,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  // Faxina oportunista das sessões vencidas desse usuário.
  await db
    .delete(parceiroSessoes)
    .where(and(eq(parceiroSessoes.usuarioId, usuarioId), lt(parceiroSessoes.expiraEm, new Date())));

  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
}

/**
 * Sessão válida do parceiro, ou null. Além do token e da validade, exige que
 * o acesso do parceiro esteja `ativo` — suspender corta na próxima request.
 */
export const getParceiroSessao = cache(async (): Promise<ParceiroSessao | null> => {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      usuarioId: parceiroUsuarios.id,
      parceiroId: parceiros.id,
      nome: parceiroUsuarios.nome,
      email: parceiroUsuarios.email,
      parceiroNome: parceiros.nome,
      produtosHabilitados: parceiros.produtosHabilitados,
      portalAcesso: parceiros.portalAcesso,
    })
    .from(parceiroSessoes)
    .innerJoin(parceiroUsuarios, eq(parceiroUsuarios.id, parceiroSessoes.usuarioId))
    .innerJoin(parceiros, eq(parceiros.id, parceiroUsuarios.parceiroId))
    .where(
      and(
        eq(parceiroSessoes.tokenHash, hashToken(token)),
        gt(parceiroSessoes.expiraEm, new Date()),
      ),
    )
    .limit(1);

  if (!row || row.portalAcesso !== "ativo") return null;
  return {
    usuarioId: row.usuarioId,
    parceiroId: row.parceiroId,
    nome: row.nome,
    email: row.email,
    parceiroNome: row.parceiroNome,
    produtosHabilitados: row.produtosHabilitados,
  };
});

/** Pra páginas: sem sessão, manda pro login do portal. */
export async function exigirParceiro(): Promise<ParceiroSessao> {
  const sessao = await getParceiroSessao();
  if (!sessao) redirect(ROTA_ENTRAR);
  return sessao;
}

export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) {
    await db.delete(parceiroSessoes).where(eq(parceiroSessoes.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE_SESSAO);
}

/** Derruba TODAS as sessões do usuário (troca de senha, suspensão). */
export async function encerrarTodasAsSessoes(usuarioId: string): Promise<void> {
  await db.delete(parceiroSessoes).where(eq(parceiroSessoes.usuarioId, usuarioId));
}
