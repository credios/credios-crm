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

const ERRO_LOGIN =
  "E-mail ou senha incorretos. Depois de várias tentativas o acesso fica bloqueado por 15 minutos.";

export async function autenticar(emailRaw: string, senha: string, meta: Meta): Promise<Resultado> {
  const email = emailRaw.toLowerCase().trim();
  const [u] = await db
    .select({
      id: parceiroUsuarios.id,
      senhaHash: parceiroUsuarios.senhaHash,
      bloqueadoAte: parceiroUsuarios.bloqueadoAte,
      portalAcesso: parceiros.portalAcesso,
    })
    .from(parceiroUsuarios)
    .innerJoin(parceiros, eq(parceiros.id, parceiroUsuarios.parceiroId))
    .where(eq(parceiroUsuarios.email, email))
    .limit(1);

  // Todo caminho de falha gasta o MESMO scrypt e devolve a MESMA mensagem:
  // nem o texto nem o tempo dizem se o e-mail existe, se a conta está
  // bloqueada, suspensa ou ainda sem senha.
  const bloqueado = !!u?.bloqueadoAte && u.bloqueadoAte > new Date();
  const senhaOk = await verificarSenha(senha, u?.senhaHash ?? HASH_ISCA);
  if (!u || !u.senhaHash) return { ok: false, erro: ERRO_LOGIN };
  if (bloqueado) return { ok: false, erro: ERRO_LOGIN };

  if (!senhaOk) {
    // Incremento atômico: tentativas em paralelo não passam do limite.
    const [f] = await db
      .update(parceiroUsuarios)
      .set({ falhasLogin: sql`${parceiroUsuarios.falhasLogin} + 1` })
      .where(eq(parceiroUsuarios.id, u.id))
      .returning({ falhas: parceiroUsuarios.falhasLogin });
    if ((f?.falhas ?? 0) >= MAX_FALHAS) {
      await db
        .update(parceiroUsuarios)
        .set({ falhasLogin: 0, bloqueadoAte: new Date(Date.now() + BLOQUEIO_MS) })
        .where(eq(parceiroUsuarios.id, u.id));
    }
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
 * Admin trocou o e-mail do parceiro: o login acompanha. Só o admin chega
 * aqui (a rota barra os demais quando o acesso ao portal já existe).
 */
export async function sincronizarEmailDeLogin(
  parceiroId: string,
  novoEmail: string | null,
): Promise<Resultado> {
  const [u] = await db
    .select({ id: parceiroUsuarios.id })
    .from(parceiroUsuarios)
    .where(eq(parceiroUsuarios.parceiroId, parceiroId))
    .limit(1);
  if (!u) return { ok: true };
  if (!novoEmail) {
    return { ok: false, erro: "Este parceiro tem login no portal — o e-mail não pode ficar vazio." };
  }
  const [dono] = await db
    .select({ parceiroId: parceiroUsuarios.parceiroId })
    .from(parceiroUsuarios)
    .where(eq(parceiroUsuarios.email, novoEmail))
    .limit(1);
  if (dono && dono.parceiroId !== parceiroId) {
    return { ok: false, erro: "Este e-mail já é o login de outro parceiro." };
  }
  await db
    .update(parceiroUsuarios)
    .set({
      email: novoEmail,
      conviteTokenHash: null,
      conviteExpiraEm: null,
      resetTokenHash: null,
      resetExpiraEm: null,
      updatedAt: new Date(),
    })
    .where(eq(parceiroUsuarios.id, u.id));
  await encerrarTodasAsSessoes(u.id);
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

  if (p.portalAcesso === "suspenso") {
    return { ok: false, erro: "O acesso deste parceiro está suspenso. Reative antes de convidar." };
  }
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
  // Token inválido não custa scrypt (rota anônima).
  if (!(await lerConvite(token))) {
    return { ok: false, erro: "Este convite expirou ou já foi usado. Peça um novo à Credios." };
  }

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
  const [valido] = await db
    .select({ id: parceiroUsuarios.id })
    .from(parceiroUsuarios)
    .where(
      and(
        eq(parceiroUsuarios.resetTokenHash, hashToken(token)),
        gt(parceiroUsuarios.resetExpiraEm, new Date()),
      ),
    )
    .limit(1);
  if (!valido) return { ok: false, erro: "Este link expirou ou já foi usado. Peça um novo." };

  const senhaHash = await hashSenha(senha);
  const [u] = await db
    .update(parceiroUsuarios)
    .set({
      senhaHash,
      // Qualquer link de definir senha ainda em aberto morre junto.
      conviteTokenHash: null,
      conviteExpiraEm: null,
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
    .set({
      senhaHash: await hashSenha(novaSenha),
      conviteTokenHash: null,
      conviteExpiraEm: null,
      resetTokenHash: null,
      resetExpiraEm: null,
      updatedAt: new Date(),
    })
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
