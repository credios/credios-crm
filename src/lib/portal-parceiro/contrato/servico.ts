import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  parceiroContratoEventos,
  parceiroContratos,
  parceiroInteracoes,
  parceiros,
  users as usersTable,
} from "../../../../db/schema";
import { db } from "@/lib/db";
import { formatCpfOrCnpj } from "@/lib/formatters/cpf-cnpj";

import {
  portalParceiroUrl,
  sendContratoAssinadoParceiroEmail,
  sendContratoConcluidoEmail,
  sendOtpContratoEmail,
  sendPedidoContraAssinaturaEmail,
} from "../email";
import { gerarCodigoVerificacao, gerarOtp, hashIgual, hashToken } from "../tokens";
import { mesclarContrato, nomeContratual } from "./mescla";
import {
  CONTRATO_MODELO_V3,
  CREDIOS,
  VERSAO_MINIMA_CONDOMINIO,
  VERSAO_MODELO,
} from "./modelo";
import { buildSignedPdf, renderContractPdf } from "./pdf";

// Ciclo do contrato de parceria: gerar → parceiro lê → código por e-mail →
// parceiro assina (acesso liberado) → Credios contra-assina (PDF final com
// manifesto). A identidade do parceiro vem da sessão do portal + OTP no e-mail.

type Meta = { ip?: string | null; userAgent?: string | null };
type Resultado = { ok: true } | { ok: false; erro: string };

const PENDENTES = ["enviado", "visualizado"];
const ASSINADOS = ["assinado_parceiro", "concluido"];
const OTP_MS = 10 * 60 * 1000;
const OTP_MAX_TENTATIVAS = 5;
const OTP_MAX_ENVIOS = 3; // por janela de 10 min

// Colunas leves — nunca traz os PDFs (bytea) sem precisar.
const resumo = {
  id: parceiroContratos.id,
  parceiroId: parceiroContratos.parceiroId,
  versaoModelo: parceiroContratos.versaoModelo,
  status: parceiroContratos.status,
  codigoVerificacao: parceiroContratos.codigoVerificacao,
  otpVerificado: parceiroContratos.otpVerificado,
  assinadoEm: parceiroContratos.assinadoEm,
  crediosAssinadoEm: parceiroContratos.crediosAssinadoEm,
  crediosAssinanteNome: parceiroContratos.crediosAssinanteNome,
  hashDocumento: parceiroContratos.hashDocumento,
  createdAt: parceiroContratos.createdAt,
};
export type ContratoResumo = Awaited<ReturnType<typeof contratoVigente>>;

async function evento(contratoId: string, nome: string, meta: Meta = {}, metadata?: unknown) {
  await db.insert(parceiroContratoEventos).values({
    contratoId,
    evento: nome,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    metadata: (metadata ?? null) as never,
  });
}

function ehViolacaoDeUnicidade(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/** Contrato assinado mais recente do parceiro (pelo parceiro ou concluído). */
export async function contratoVigente(parceiroId: string) {
  const [c] = await db
    .select(resumo)
    .from(parceiroContratos)
    .where(
      and(eq(parceiroContratos.parceiroId, parceiroId), inArray(parceiroContratos.status, ASSINADOS)),
    )
    .orderBy(desc(parceiroContratos.versaoModelo), desc(parceiroContratos.assinadoEm))
    .limit(1);
  return c ?? null;
}

/**
 * O parceiro precisa assinar contrato antes de usar o portal? Sim se não tem
 * nenhum assinado, ou se está habilitado em condomínio e o contrato dele é
 * anterior à versão que cobre esse produto.
 */
export async function precisaAssinarContrato(
  parceiroId: string,
  produtosHabilitados: string[],
): Promise<boolean> {
  const c = await contratoVigente(parceiroId);
  if (!c) return true;
  return (
    produtosHabilitados.includes("CONDOMINIO") && c.versaoModelo < VERSAO_MINIMA_CONDOMINIO
  );
}

/**
 * Devolve o contrato pendente do parceiro na versão vigente, gerando se não
 * existir. Pendente de versão antiga é cancelado (nunca dois pendentes).
 */
export async function garantirContratoPendente(
  parceiroId: string,
): Promise<{ ok: true; id: string; corpoHtml: string; codigo: string; otpVerificado: boolean } | { ok: false; erro: string }> {
  const [p] = await db
    .select({
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      cpfCnpj: parceiros.cpfCnpj,
      email: parceiros.email,
      whatsapp: parceiros.whatsapp,
      comissaoPadraoBps: parceiros.comissaoPadraoBps,
    })
    .from(parceiros)
    .where(eq(parceiros.id, parceiroId))
    .limit(1);
  if (!p) return { ok: false, erro: "Parceiro não encontrado." };
  const doc = (p.cpfCnpj ?? "").replace(/\D/g, "");
  if (!p.email || (doc.length !== 11 && doc.length !== 14)) {
    return {
      ok: false,
      erro: `Seu cadastro está sem CPF/CNPJ ou e-mail. Fale com a Credios (${CREDIOS.emailParcerias}) para completar e liberar o contrato.`,
    };
  }

  const [pendente] = await db
    .select({
      id: parceiroContratos.id,
      versaoModelo: parceiroContratos.versaoModelo,
      corpoHtml: parceiroContratos.corpoHtml,
      codigo: parceiroContratos.codigoVerificacao,
      otpVerificado: parceiroContratos.otpVerificado,
    })
    .from(parceiroContratos)
    .where(
      and(eq(parceiroContratos.parceiroId, parceiroId), inArray(parceiroContratos.status, PENDENTES)),
    )
    .orderBy(asc(parceiroContratos.createdAt), asc(parceiroContratos.id))
    .limit(1);
  if (pendente && pendente.versaoModelo === VERSAO_MODELO) {
    return { ok: true, ...pendente };
  }
  if (pendente) {
    await db
      .update(parceiroContratos)
      .set({ status: "cancelado", updatedAt: new Date() })
      .where(eq(parceiroContratos.id, pendente.id));
  }

  const agora = new Date();
  const corpoHtml = mesclarContrato(
    CONTRATO_MODELO_V3,
    { ...p, cpfCnpj: doc, email: p.email },
    agora,
  );
  const codigo = gerarCodigoVerificacao();
  const pdf = Buffer.from(await renderContractPdf(corpoHtml, { verifyCode: codigo }));

  // A página pode ser renderizada duas vezes em paralelo (prefetch + navegação).
  // O índice único (0054) barra o segundo INSERT; sem ele, a convergência
  // abaixo cancela o excedente. Nos dois casos todo mundo recebe o MESMO
  // contrato — o mais antigo.
  let criadoId: string | null = null;
  try {
    const [novo] = await db
      .insert(parceiroContratos)
      .values({
        parceiroId,
        versaoModelo: VERSAO_MODELO,
        corpoHtml,
        status: "enviado",
        codigoVerificacao: codigo,
        pdfOriginal: pdf,
        enviadoEm: agora,
      })
      .returning({ id: parceiroContratos.id });
    criadoId = novo!.id;
  } catch (e) {
    // O Drizzle embrulha o erro do Postgres: o código (23505 = violação de
    // unicidade) vem em `cause`, não no erro de fora.
    if (!ehViolacaoDeUnicidade(e)) throw e;
  }

  const pendentes = await db
    .select({
      id: parceiroContratos.id,
      corpoHtml: parceiroContratos.corpoHtml,
      codigo: parceiroContratos.codigoVerificacao,
      otpVerificado: parceiroContratos.otpVerificado,
    })
    .from(parceiroContratos)
    .where(
      and(eq(parceiroContratos.parceiroId, parceiroId), inArray(parceiroContratos.status, PENDENTES)),
    )
    .orderBy(asc(parceiroContratos.createdAt), asc(parceiroContratos.id));
  const vencedor = pendentes[0];
  if (!vencedor) return { ok: false, erro: "Não foi possível gerar o contrato. Recarregue a página." };

  const excedentes = pendentes.slice(1).map((c) => c.id);
  if (excedentes.length > 0) {
    await db
      .update(parceiroContratos)
      .set({ status: "cancelado", updatedAt: new Date() })
      .where(inArray(parceiroContratos.id, excedentes));
  }
  if (criadoId === vencedor.id) {
    await evento(vencedor.id, "GENERATED");
    await evento(vencedor.id, "SENT");
  }
  return { ok: true, ...vencedor };
}

/** Parceiro abriu o contrato pra ler. */
export async function registrarVisualizacao(contratoId: string, meta: Meta): Promise<void> {
  const [c] = await db
    .update(parceiroContratos)
    .set({ status: "visualizado", visualizadoEm: new Date() })
    .where(and(eq(parceiroContratos.id, contratoId), eq(parceiroContratos.status, "enviado")))
    .returning({ id: parceiroContratos.id });
  if (c) await evento(contratoId, "LINK_OPENED", meta);
}

async function pendenteDoParceiro(parceiroId: string) {
  const [c] = await db
    .select({
      id: parceiroContratos.id,
      otpHash: parceiroContratos.otpHash,
      otpExpiraEm: parceiroContratos.otpExpiraEm,
      otpTentativas: parceiroContratos.otpTentativas,
      otpVerificado: parceiroContratos.otpVerificado,
      codigo: parceiroContratos.codigoVerificacao,
    })
    .from(parceiroContratos)
    .where(
      and(
        eq(parceiroContratos.parceiroId, parceiroId),
        inArray(parceiroContratos.status, PENDENTES),
        eq(parceiroContratos.versaoModelo, VERSAO_MODELO),
      ),
    )
    // O mais antigo — o mesmo que garantirContratoPendente entrega.
    .orderBy(asc(parceiroContratos.createdAt), asc(parceiroContratos.id))
    .limit(1);
  return c ?? null;
}

const SEM_PENDENTE: Resultado = {
  ok: false,
  erro: "Não há contrato pendente de assinatura. Recarregue a página.",
};

export async function enviarOtp(
  parceiroId: string,
  destinatario: { nome: string; email: string },
  meta: Meta,
): Promise<Resultado> {
  const c = await pendenteDoParceiro(parceiroId);
  if (!c) return SEM_PENDENTE;

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(parceiroContratoEventos)
    .where(
      and(
        eq(parceiroContratoEventos.contratoId, c.id),
        eq(parceiroContratoEventos.evento, "OTP_SENT"),
        sql`${parceiroContratoEventos.criadoEm} > now() - interval '10 minutes'`,
      ),
    );
  if (n >= OTP_MAX_ENVIOS) {
    return { ok: false, erro: "Muitos códigos enviados. Aguarde alguns minutos e tente de novo." };
  }

  const { otp, hash } = gerarOtp();
  await db
    .update(parceiroContratos)
    .set({
      otpHash: hash,
      otpExpiraEm: new Date(Date.now() + OTP_MS),
      otpTentativas: 0,
      otpVerificado: false,
    })
    .where(eq(parceiroContratos.id, c.id));
  await evento(c.id, "OTP_SENT", meta);

  const envio = await sendOtpContratoEmail({ ...destinatario, otp });
  return envio.ok
    ? { ok: true }
    : { ok: false, erro: "Não conseguimos enviar o código. Tente novamente em instantes." };
}

export async function verificarOtp(
  parceiroId: string,
  otp: string,
  meta: Meta,
): Promise<Resultado> {
  const c = await pendenteDoParceiro(parceiroId);
  if (!c) return SEM_PENDENTE;
  if (c.otpTentativas >= OTP_MAX_TENTATIVAS) {
    return { ok: false, erro: "Muitas tentativas. Peça um novo código." };
  }
  if (!c.otpHash || !c.otpExpiraEm || c.otpExpiraEm < new Date()) {
    return { ok: false, erro: "Código expirado. Peça um novo código." };
  }
  const digitos = otp.replace(/\D/g, "");
  if (digitos.length !== 6 || !hashIgual(hashToken(digitos), c.otpHash)) {
    await db
      .update(parceiroContratos)
      .set({ otpTentativas: sql`${parceiroContratos.otpTentativas} + 1` })
      .where(eq(parceiroContratos.id, c.id));
    return { ok: false, erro: "Código incorreto. Confira o e-mail e tente de novo." };
  }
  // Código é de uso único: some assim que confere.
  await db
    .update(parceiroContratos)
    .set({ otpVerificado: true, otpHash: null, otpExpiraEm: null })
    .where(eq(parceiroContratos.id, c.id));
  await evento(c.id, "OTP_VERIFIED", meta);
  return { ok: true };
}

/** Assinatura do PARCEIRO. Libera o portal; a via final sai na contra-assinatura. */
export async function assinarComoParceiro(
  parceiroId: string,
  quem: { nome: string; email: string },
  meta: Meta,
): Promise<Resultado> {
  const c = await pendenteDoParceiro(parceiroId);
  if (!c) {
    // Duplo clique: já assinou → ok.
    return (await contratoVigente(parceiroId))?.versaoModelo === VERSAO_MODELO
      ? { ok: true }
      : SEM_PENDENTE;
  }
  if (!c.otpVerificado) {
    return { ok: false, erro: "Confirme o código enviado ao seu e-mail antes de assinar." };
  }

  // UPDATE condicionado ao status: duas requisições não assinam duas vezes.
  const [assinado] = await db
    .update(parceiroContratos)
    .set({ status: "assinado_parceiro", assinadoEm: new Date(), updatedAt: new Date() })
    .where(and(eq(parceiroContratos.id, c.id), inArray(parceiroContratos.status, PENDENTES)))
    .returning({ id: parceiroContratos.id });
  if (!assinado) return { ok: true };

  await db
    .update(parceiroContratos)
    .set({ status: "cancelado", updatedAt: new Date() })
    .where(
      and(eq(parceiroContratos.parceiroId, parceiroId), inArray(parceiroContratos.status, PENDENTES)),
    );
  await evento(c.id, "SIGNED", meta);
  await evento(c.id, "ADMIN_SIGN_REQUESTED");
  await db.insert(parceiroInteracoes).values({
    parceiroId,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: `Parceiro assinou o contrato de parceria (modelo v${VERSAO_MODELO}). Aguardando a assinatura da Credios.`,
    metadata: { kind: "contrato_assinado_parceiro", contratoId: c.id },
  });
  // Parceria formalizada: o pipeline de relacionamento vira "ativo".
  await db
    .update(parceiros)
    .set({ status: "ativo", ativoEm: sql`COALESCE(${parceiros.ativoEm}, now())`, updatedAt: new Date() })
    .where(and(eq(parceiros.id, parceiroId), sql`${parceiros.status} <> 'ativo'`));

  await sendContratoAssinadoParceiroEmail({ ...quem, codigo: c.codigo });
  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.perfil, "admin"), eq(usersTable.ativo, true)));
  const [par] = await db
    .select({ nome: parceiros.nome })
    .from(parceiros)
    .where(eq(parceiros.id, parceiroId))
    .limit(1);
  await sendPedidoContraAssinaturaEmail({
    para: admins.map((a) => a.email).filter(Boolean),
    parceiroNome: par?.nome ?? quem.nome,
    parceiroId,
  });
  return { ok: true };
}

/**
 * Contra-assinatura da Credios (admin logado no CRM, com 2FA). Gera o PDF
 * final com os dois carimbos + manifesto e fecha o contrato.
 */
export async function contraAssinar(
  contratoId: string,
  admin: { id: string; nome: string; email: string },
  meta: Meta,
): Promise<Resultado> {
  const [c] = await db
    .select({
      id: parceiroContratos.id,
      parceiroId: parceiroContratos.parceiroId,
      status: parceiroContratos.status,
      codigo: parceiroContratos.codigoVerificacao,
      pdfOriginal: parceiroContratos.pdfOriginal,
      assinadoEm: parceiroContratos.assinadoEm,
    })
    .from(parceiroContratos)
    .where(eq(parceiroContratos.id, contratoId))
    .limit(1);
  if (!c) return { ok: false, erro: "Contrato não encontrado." };
  if (c.status === "concluido") return { ok: true };
  if (c.status !== "assinado_parceiro") {
    return { ok: false, erro: "O parceiro ainda não assinou — a contra-assinatura vem depois." };
  }
  if (!c.pdfOriginal || !c.assinadoEm) {
    return { ok: false, erro: "Documento original indisponível." };
  }

  const [p] = await db
    .select({
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      cpfCnpj: parceiros.cpfCnpj,
      email: parceiros.email,
    })
    .from(parceiros)
    .where(eq(parceiros.id, c.parceiroId))
    .limit(1);
  if (!p) return { ok: false, erro: "Parceiro não encontrado." };

  const agora = new Date();
  await evento(c.id, "ADMIN_SIGNED", meta, { adminId: admin.id, adminName: admin.nome });
  const eventos = await db
    .select({
      event: parceiroContratoEventos.evento,
      createdAt: parceiroContratoEventos.criadoEm,
      ip: parceiroContratoEventos.ip,
      userAgent: parceiroContratoEventos.userAgent,
    })
    .from(parceiroContratoEventos)
    .where(eq(parceiroContratoEventos.contratoId, c.id))
    .orderBy(asc(parceiroContratoEventos.criadoEm));

  const { pdf, hash } = await buildSignedPdf({
    unsignedPdf: new Uint8Array(c.pdfOriginal),
    signers: [
      {
        role: "PARCEIRO(A)",
        name: nomeContratual({ nome: p.nome, empresa: p.empresa, cpfCnpj: p.cpfCnpj ?? "" }),
        document: formatCpfOrCnpj(p.cpfCnpj),
        email: p.email ?? "",
        signedAt: c.assinadoEm,
        verification: "Sessão autenticada no Portal de Parceiros + código enviado ao e-mail",
      },
      {
        role: "CREDIOS (CONTRATADA)",
        name: admin.nome,
        document: CREDIOS.cnpj,
        email: admin.email,
        signedAt: agora,
        verification: "Usuário administrador autenticado com segundo fator (TOTP)",
      },
    ],
    events: eventos,
    verifyCode: c.codigo,
    verifyUrl: portalParceiroUrl(`/verificar/${c.codigo}`),
  });

  // Condicionado ao status: se outra aba concluiu antes, não sobrescreve o PDF.
  const [fechado] = await db
    .update(parceiroContratos)
    .set({
      status: "concluido",
      pdfAssinado: Buffer.from(pdf),
      hashDocumento: hash,
      crediosAssinadoEm: agora,
      crediosAssinanteId: admin.id,
      crediosAssinanteNome: admin.nome,
      updatedAt: agora,
    })
    .where(and(eq(parceiroContratos.id, c.id), eq(parceiroContratos.status, "assinado_parceiro")))
    .returning({ id: parceiroContratos.id });
  if (!fechado) return { ok: true };

  await db.insert(parceiroInteracoes).values({
    parceiroId: c.parceiroId,
    autorId: admin.id,
    tipo: "evento_sistema",
    conteudo: `Contrato de parceria concluído — contra-assinado por ${admin.nome}.`,
    metadata: { kind: "contrato_concluido", contratoId: c.id },
  });
  if (p.email) {
    await sendContratoConcluidoEmail({ nome: p.nome, email: p.email, codigo: c.codigo });
  }
  return { ok: true };
}

/** PDF pra download: o final se concluído, senão o original. */
export async function pdfDoContrato(contratoId: string, parceiroId?: string) {
  const [c] = await db
    .select({
      parceiroId: parceiroContratos.parceiroId,
      status: parceiroContratos.status,
      codigo: parceiroContratos.codigoVerificacao,
      pdfOriginal: parceiroContratos.pdfOriginal,
      pdfAssinado: parceiroContratos.pdfAssinado,
    })
    .from(parceiroContratos)
    .where(eq(parceiroContratos.id, contratoId))
    .limit(1);
  if (!c || (parceiroId && c.parceiroId !== parceiroId)) return null;
  const bytes = c.pdfAssinado ?? c.pdfOriginal;
  if (!bytes) return null;
  return { bytes, nome: `contrato-credios-${c.codigo}.pdf`, final: !!c.pdfAssinado };
}

/** Todos os contratos do parceiro, mais recente primeiro (sem os PDFs). */
export async function contratosDoParceiro(parceiroId: string) {
  return db
    .select(resumo)
    .from(parceiroContratos)
    .where(eq(parceiroContratos.parceiroId, parceiroId))
    .orderBy(desc(parceiroContratos.createdAt));
}

/**
 * Conferência pública por código. Só devolve o que prova autenticidade —
 * documento mascarado, nada de e-mail, telefone ou texto do contrato.
 */
export async function verificarPorCodigo(codigoRaw: string) {
  const codigo = codigoRaw.trim().toUpperCase();
  if (!/^CRD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) return null;
  const [c] = await db
    .select({
      status: parceiroContratos.status,
      versaoModelo: parceiroContratos.versaoModelo,
      assinadoEm: parceiroContratos.assinadoEm,
      crediosAssinadoEm: parceiroContratos.crediosAssinadoEm,
      crediosAssinanteNome: parceiroContratos.crediosAssinanteNome,
      hashDocumento: parceiroContratos.hashDocumento,
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      cpfCnpj: parceiros.cpfCnpj,
    })
    .from(parceiroContratos)
    .innerJoin(parceiros, eq(parceiros.id, parceiroContratos.parceiroId))
    .where(eq(parceiroContratos.codigoVerificacao, codigo))
    .limit(1);
  if (!c || !ASSINADOS.includes(c.status)) return null;
  const doc = (c.cpfCnpj ?? "").replace(/\D/g, "");
  return {
    codigo,
    concluido: c.status === "concluido",
    versaoModelo: c.versaoModelo,
    parceiro: nomeContratual({ nome: c.nome, empresa: c.empresa, cpfCnpj: doc }),
    documentoMascarado:
      doc.length === 11
        ? `***.${doc.slice(3, 6)}.${doc.slice(6, 9)}-**`
        : doc.length === 14
          ? `**.${doc.slice(2, 5)}.${doc.slice(5, 8)}/****-**`
          : "—",
    assinadoEm: c.assinadoEm,
    crediosAssinadoEm: c.crediosAssinadoEm,
    crediosAssinanteNome: c.crediosAssinanteNome,
    hashDocumento: c.hashDocumento,
  };
}
