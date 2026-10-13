import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";

import { parceiroInteracoes, parceiroUsuarios, parceiros } from "../../../db/schema";
import { db } from "@/lib/db";

import { sendConviteParceiroEmail, sendResetSenhaParceiroEmail } from "./email";
import { hashSenha, validarSenha, verificarSenha } from "./senha";
import { criarSessao, encerrarTodasAsSessoes } from "./sessao";
import { gerarToken, hashToken } from "./tokens";

// Ciclo de vida da conta do parceiro: convite → senha → login → redefinição.
// Toda resposta de falha de login/convite/reset é GENÉRICA — não revela se o
// e-mail existe, se a conta está suspensa ou se a senha estava quase certa.

const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;
const CONVITE_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_MS = 60 * 60 * 1000;

// Hash descartável: quando o e-mail não existe, gastamos o mesmo scrypt pra o
// tempo de resposta não denunciar quais e-mails têm conta.
const HASH_ISCA =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

type Meta = { ip?: string | null; userAgent?: string | null };
type Resultado = { ok: true } | { ok: false; erro: string };

const ERRO_LOGIN = "E-mail ou senha incorretos. Confira e tente de novo.";

export async function autenticar(emailRaw: string, senha: string, meta: Meta): Promise<Resultado> {
  const email = emailRaw.toLowerCase().trim();
  const [u] = await db
    .select({
      id: parceiroUsuarios.id,
      senhaHash: parceiroUsuarios.senhaHash,
      falhasLogin: parceiroUsuarios.falhasLogin,
      bloqueadoAte: parceiroUsuarios.bloqueadoAte,
      portalAcesso: parceiros.portalAcesso,
    })
    .from(parceiroUsuarios)
    .innerJoin(parceiros, eq(parceiros.id, parceiroUsuarios.parceiroId))
    .where(eq(parceiroUsuarios.email, email))
    .limit(1);

  if (!u) {
    await verificarSenha(senha, HASH_ISCA);
    return { ok: false, erro: ERRO_LOGIN };
  }
  if (u.bloqueadoAte && u.bloqueadoAte > new Date()) {
    return { ok: false, erro: "Muitas tentativas. Aguarde 15 minutos e tente de novo." };
  }

  const senhaOk = await verificarSenha(senha, u.senhaHash);
  if (!senhaOk) {
    const falhas = u.falhasLogin + 1;
    await db
      .update(parceiroUsuarios)
      .set(
        falhas >= MAX_FALHAS
          ? { falhasLogin: 0, bloqueadoAte: new Date(Date.now() + BLOQUEIO_MS) }
          : { falhasLogin: falhas },
      )
      .where(eq(parceiroUsuarios.id, u.id));
    return { ok: false, erro: ERRO_LOGIN };
  }
  // Senha certa mas acesso suspenso/não liberado: mesma mensagem genérica.
  if (u.portalAcesso !== "ativo") return { ok: false, erro: ERRO_LOGIN };

  await db
    .update(parceiroUsuarios)
    .set({ falhasLogin: 0, bloqueadoAte: null, ultimoLoginEm: new Date() })
    .where(eq(parceiroUsuarios.id, u.id));
  await criarSessao(u.id, meta);
  return { ok: true };
}

/**
 * Admin libera (ou reenvia) o acesso: cria/atualiza o login com um token de
 * convite e manda o e-mail. Parceiro que já tem senha recebe um link pra
 * definir uma nova — o convite funciona também como "redefinir pelo admin".
 */
export async function convidarParceiro(
  parceiroId: string,
  autorId: string,
): Promise<Resultado> {
  const [p] = await db
    .select({
      id: parceiros.id,
      nome: parceiros.nome,
      email: parceiros.email,
      portalAcesso: parceiros.portalAcesso,
    })
    .from(parceiros)
    .where(eq(parceiros.id, parceiroId))
    .limit(1);
  if (!p) return { ok: false, erro: "Parceiro não encontrado." };
  if (!p.email) return { ok: false, erro: "Cadastre o e-mail do parceiro antes de convidar." };
  const email = p.email.toLowerCase().trim();

  const [dono] = await db
    .select({ parceiroId: parceiroUsuarios.parceiroId })
    .from(parceiroUsuarios)
    .where(eq(parceiroUsuarios.email, email))
    .limit(1);
  if (dono && dono.parceiroId !== parceiroId) {
    return { ok: false, erro: "Este e-mail já é o login de outro parceiro." };
  }

  const { token, hash } = gerarToken();
  const expira = new Date(Date.now() + CONVITE_MS);
  await db
    .insert(parceiroUsuarios)
    .values({
      parceiroId,
      email,
      nome: p.nome,
      conviteTokenHash: hash,
      conviteExpiraEm: expira,
    })
    .onConflictDoUpdate({
      target: parceiroUsuarios.parceiroId,
      set: {
        email,
        nome: p.nome,
        conviteTokenHash: hash,
        conviteExpiraEm: expira,
        updatedAt: new Date(),
      },
    });

  if (p.portalAcesso === "sem_acesso") {
    await db
      .update(parceiros)
      .set({ portalAcesso: "convidado", updatedAt: new Date() })
      .where(eq(parceiros.id, parceiroId));
  }

  const envio = await sendConviteParceiroEmail({ nome: p.nome, email, token });
  await db.insert(parceiroInteracoes).values({
    parceiroId,
    autorId,
    tipo: "evento_sistema",
    conteudo: envio.ok
      ? `Convite do portal enviado para ${email}.`
      : `Convite do portal gerado, mas o e-mail falhou (${envio.reason ?? "erro"}).`,
    metadata: { kind: "portal_convite", emailOk: envio.ok },
  });
  return envio.ok
    ? { ok: true }
    : { ok: false, erro: "Convite gerado, mas o e-mail não saiu. Tente reenviar." };
}

/** Convite ainda válido? Devolve nome/e-mail pra tela de criar senha. */
export async function lerConvite(token: string) {
  const [u] = await db
    .select({ nome: parceiroUsuarios.nome, email: parceiroUsuarios.email })
    .from(parceiroUsuarios)
    .where(
      and(
        eq(parceiroUsuarios.conviteTokenHash, hashToken(token)),
        gt(parceiroUsuarios.conviteExpiraEm, new Date()),
      ),
    )
    .limit(1);
  return u ?? null;
}

export async function aceitarConvite(
  token: string,
  senha: string,
  meta: Meta,
): Promise<Resultado> {
  const erroSenha = validarSenha(senha);
  if (erroSenha) return { ok: false, erro: erroSenha };

  const senhaHash = await hashSenha(senha);
  // UPDATE condicionado ao token: consome o convite de forma atômica (dois
  // cliques simultâneos não criam duas senhas).
  const [u] = await db
    .update(parceiroUsuarios)
    .set({
      senhaHash,
      conviteTokenHash: null,
      conviteExpiraEm: null,
      resetTokenHash: null,
      resetExpiraEm: null,
      falhasLogin: 0,
      bloqueadoAte: null,
      termosAceitosEm: sql`COALESCE(${parceiroUsuarios.termosAceitosEm}, now())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(parceiroUsuarios.conviteTokenHash, hashToken(token)),
        gt(parceiroUsuarios.conviteExpiraEm, new Date()),
      ),
    )
    .returning({ id: parceiroUsuarios.id, parceiroId: parceiroUsuarios.parceiroId });
  if (!u) {
    return { ok: false, erro: "Este convite expirou ou já foi usado. Peça um novo à Credios." };
  }

  // Suspenso continua suspenso: o convite não reabre acesso cortado pelo admin.
  const [p] = await db
    .update(parceiros)
    .set({ portalAcesso: "ativo", updatedAt: new Date() })
    .where(and(eq(parceiros.id, u.parceiroId), eq(parceiros.portalAcesso, "convidado")))
    .returning({ id: parceiros.id });

  await encerrarTodasAsSessoes(u.id);
  await db.insert(parceiroInteracoes).values({
    parceiroId: u.parceiroId,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: "Parceiro criou a senha do portal.",
    metadata: { kind: "portal_senha_criada" },
  });

  const [atual] = p
    ? [{ portalAcesso: "ativo" }]
    : await db
        .select({ portalAcesso: parceiros.portalAcesso })
        .from(parceiros)
        .where(eq(parceiros.id, u.parceiroId))
        .limit(1);
  if (atual?.portalAcesso === "ativo") await criarSessao(u.id, meta);
  return { ok: true };
}

/** Sempre "ok" pra quem chama — não revela se o e-mail tem conta. */
export async function solicitarResetSenha(emailRaw: string): Promise<void> {
  const email = emailRaw.toLowerCase().trim();
  const [u] = await db
    .select({
      id: parceiroUsuarios.id,
      nome: parceiroUsuarios.nome,
      senhaHash: parceiroUsuarios.senhaHash,
      portalAcesso: parceiros.portalAcesso,
    })
    .from(parceiroUsuarios)
    .innerJoin(parceiros, eq(parceiros.id, parceiroUsuarios.parceiroId))
    .where(eq(parceiroUsuarios.email, email))
    .limit(1);
  // Só pra conta ativa que já tem senha: reset não substitui convite.
  if (!u || !u.senhaHash || u.portalAcesso !== "ativo") return;

  const { token, hash } = gerarToken();
  await db
    .update(parceiroUsuarios)
    .set({ resetTokenHash: hash, resetExpiraEm: new Date(Date.now() + RESET_MS) })
    .where(eq(parceiroUsuarios.id, u.id));
  await sendResetSenhaParceiroEmail({ nome: u.nome, email, token });
}

export async function redefinirSenha(token: string, senha: string): Promise<Resultado> {
  const erroSenha = validarSenha(senha);
  if (erroSenha) return { ok: false, erro: erroSenha };

  const senhaHash = await hashSenha(senha);
  const [u] = await db
    .update(parceiroUsuarios)
    .set({
      senhaHash,
      resetTokenHash: null,
      resetExpiraEm: null,
      falhasLogin: 0,
      bloqueadoAte: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(parceiroUsuarios.resetTokenHash, hashToken(token)),
        gt(parceiroUsuarios.resetExpiraEm, new Date()),
      ),
    )
    .returning({ id: parceiroUsuarios.id });
  if (!u) {
    return { ok: false, erro: "Este link expirou ou já foi usado. Peça um novo." };
  }
  await encerrarTodasAsSessoes(u.id);
  return { ok: true };
}

/** Troca de senha pelo próprio parceiro, logado. Derruba as outras sessões. */
export async function trocarSenha(
  usuarioId: string,
  senhaAtual: string,
  novaSenha: string,
  meta: Meta,
): Promise<Resultado> {
  const erroSenha = validarSenha(novaSenha);
  if (erroSenha) return { ok: false, erro: erroSenha };
  const [u] = await db
    .select({ senhaHash: parceiroUsuarios.senhaHash })
    .from(parceiroUsuarios)
    .where(eq(parceiroUsuarios.id, usuarioId))
    .limit(1);
  if (!u || !(await verificarSenha(senhaAtual, u.senhaHash))) {
    return { ok: false, erro: "Senha atual incorreta." };
  }
  await db
    .update(parceiroUsuarios)
    .set({ senhaHash: await hashSenha(novaSenha), updatedAt: new Date() })
    .where(eq(parceiroUsuarios.id, usuarioId));
  await encerrarTodasAsSessoes(usuarioId);
  await criarSessao(usuarioId, meta);
  return { ok: true };
}

/** Admin suspende ou reativa o acesso. Suspender derruba as sessões na hora. */
export async function definirAcessoPortal(
  parceiroId: string,
  acao: "suspender" | "reativar",
  autorId: string,
): Promise<Resultado> {
  const [u] = await db
    .select({ id: parceiroUsuarios.id, senhaHash: parceiroUsuarios.senhaHash })
    .from(parceiroUsuarios)
    .where(eq(parceiroUsuarios.parceiroId, parceiroId))
    .limit(1);
  if (!u) return { ok: false, erro: "Este parceiro ainda não foi convidado para o portal." };

  if (acao === "suspender") {
    await db
      .update(parceiros)
      .set({ portalAcesso: "suspenso", updatedAt: new Date() })
      .where(eq(parceiros.id, parceiroId));
    await encerrarTodasAsSessoes(u.id);
  } else {
    await db
      .update(parceiros)
      .set({ portalAcesso: u.senhaHash ? "ativo" : "convidado", updatedAt: new Date() })
      .where(eq(parceiros.id, parceiroId));
  }
  await db.insert(parceiroInteracoes).values({
    parceiroId,
    autorId,
    tipo: "evento_sistema",
    conteudo: acao === "suspender" ? "Acesso ao portal suspenso." : "Acesso ao portal reativado.",
    metadata: { kind: `portal_${acao}` },
  });
  return { ok: true };
}
