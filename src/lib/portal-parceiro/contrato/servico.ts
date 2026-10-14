import "server-only";

import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";

import {
  parceiroContratoEventos,
  parceiroContratos,
  parceiroInteracoes,
  parceiros,
  users as usersTable,
} from "../../../../db/schema";
import { db } from "@/lib/db";
import { formatCpfOrCnpj, isValidCpf } from "@/lib/formatters/cpf-cnpj";

import {
  portalParceiroUrl,
  sendContratoAssinadoParceiroEmail,
  sendContratoConcluidoEmail,
  sendOtpContratoEmail,
  sendPedidoContraAssinaturaEmail,
} from "../email";
import { gerarCodigoVerificacao, gerarOtp, hashIgual, hashToken } from "../tokens";
import { mesclarContrato, nomeContratual, type DadosParceiroContrato } from "./mescla";
import {
  CONTRATO_MODELO_VIGENTE,
  CREDIOS,
  VERSAO_MINIMA_CONDOMINIO,
  VERSAO_MODELO,
} from "./modelo";
import { buildSignedPdf, renderContractPdf } from "./pdf";

// Ciclo do contrato de parceria: gerar → parceiro lê → código por e-mail →
// parceiro assina (acesso liberado) → Credios contra-assina (PDF final com
// manifesto). A identidade do parceiro vem da sessão do portal + código no
// e-mail. Toda etapa recebe o ID do contrato que estava NA TELA: o servidor
// nunca assina "o pendente que houver".

type Meta = { ip?: string | null; userAgent?: string | null };
type Resultado = { ok: true } | { ok: false; erro: string };

const PENDENTES = ["enviado", "visualizado"];
const ASSINADOS = ["assinado_parceiro", "concluido"];
const OTP_MS = 10 * 60 * 1000;
/** Depois de conferido, o código vale este tempo pra concluir a assinatura. */
const OTP_VERIFICADO_MS = 15 * 60 * 1000;
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

/** Retrato de quem assinou, gravado no momento da assinatura. */
export type Signatario = {
  nome: string;
  documento: string;
  email: string;
  usuarioId: string;
  representante: string | null;
};

type Executor = Pick<typeof db, "insert">;

async function evento(
  contratoId: string,
  nome: string,
  meta: Meta = {},
  metadata?: unknown,
  em?: Date,
  exec: Executor = db,
) {
  await exec.insert(parceiroContratoEventos).values({
    contratoId,
    evento: nome,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    metadata: (metadata ?? null) as never,
    ...(em ? { criadoEm: em } : {}),
  });
}

function ehViolacaoDeUnicidade(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * Impressão digital dos dados que entram no contrato (sem a data). Se o
 * cadastro mudar depois de gerado o pendente, o hash muda e o contrato é
 * refeito — o parceiro nunca assina texto com dado desatualizado.
 */
function hashDosDados(p: DadosParceiroContrato): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        VERSAO_MODELO,
        p.nome,
        p.empresa,
        p.cpfCnpj,
        p.email,
        p.whatsapp,
        p.comissaoPadraoBps,
        p.representanteNome ?? null,
        p.representanteCpf ?? null,
      ]),
    )
    .digest("hex");
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

async function dadosDoParceiro(parceiroId: string) {
  const [p] = await db
    .select({
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      cpfCnpj: parceiros.cpfCnpj,
      email: parceiros.email,
      whatsapp: parceiros.whatsapp,
      comissaoPadraoBps: parceiros.comissaoPadraoBps,
      representanteNome: parceiros.representanteNome,
      representanteCpf: parceiros.representanteCpf,
    })
    .from(parceiros)
    .where(eq(parceiros.id, parceiroId))
    .limit(1);
  return p ?? null;
}

export type ContratoPendente =
  | { ok: true; id: string; corpoHtml: string; codigo: string; otpVerificado: boolean }
  | { ok: false; erro: string; faltaRepresentante?: boolean };

/**
 * Devolve o contrato pendente do parceiro, gerando se não existir. Pendente
 * de versão antiga ou com dados que não batem mais com o cadastro é
 * cancelado e refeito (nunca dois pendentes — índice único da 0054).
 */
export async function garantirContratoPendente(parceiroId: string): Promise<ContratoPendente> {
  const p = await dadosDoParceiro(parceiroId);
  if (!p) return { ok: false, erro: "Parceiro não encontrado." };
  // Aceita CNPJ alfanumérico: tira só a pontuação.
  const doc = (p.cpfCnpj ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!p.email || (doc.length !== 11 && doc.length !== 14)) {
    return {
      ok: false,
      erro: `Seu cadastro está sem CPF/CNPJ ou e-mail. Fale com a Credios (${CREDIOS.emailParcerias}) para completar e liberar o contrato.`,
    };
  }
  // PJ: precisa de quem assina pela empresa, com CPF.
  if (doc.length === 14 && (!p.representanteNome?.trim() || !isValidCpf(p.representanteCpf))) {
    return {
      ok: false,
      faltaRepresentante: true,
      erro: "Informe quem assina pela empresa para gerar o contrato.",
    };
  }

  const dados: DadosParceiroContrato = { ...p, cpfCnpj: doc, email: p.email };
  const dadosHash = hashDosDados(dados);
  const agoraValido = new Date(Date.now() - OTP_VERIFICADO_MS);

  const pendentes = await db
    .select({
      id: parceiroContratos.id,
      versaoModelo: parceiroContratos.versaoModelo,
      dadosHash: parceiroContratos.dadosHash,
      corpoHtml: parceiroContratos.corpoHtml,
      codigo: parceiroContratos.codigoVerificacao,
      otpVerificado: parceiroContratos.otpVerificado,
      otpVerificadoEm: parceiroContratos.otpVerificadoEm,
    })
    .from(parceiroContratos)
    .where(
      and(eq(parceiroContratos.parceiroId, parceiroId), inArray(parceiroContratos.status, PENDENTES)),
    )
    .orderBy(asc(parceiroContratos.createdAt), asc(parceiroContratos.id));

  const atual = pendentes.find(
    (c) => c.versaoModelo === VERSAO_MODELO && c.dadosHash === dadosHash,
  );
  const descartar = pendentes.filter((c) => c.id !== atual?.id).map((c) => c.id);
  if (descartar.length > 0) {
    await db
      .update(parceiroContratos)
      .set({ status: "cancelado", updatedAt: new Date() })
      .where(inArray(parceiroContratos.id, descartar));
  }
  if (atual) {
    return {
      ok: true,
      id: atual.id,
      corpoHtml: atual.corpoHtml,
      codigo: atual.codigo,
      otpVerificado:
        atual.otpVerificado && !!atual.otpVerificadoEm && atual.otpVerificadoEm > agoraValido,
    };
  }

  const agora = new Date();
  const corpoHtml = mesclarContrato(CONTRATO_MODELO_VIGENTE, dados, agora);
  const codigo = gerarCodigoVerificacao();
  const pdf = Buffer.from(await renderContractPdf(corpoHtml, { verifyCode: codigo }));

  // A página pode ser renderizada duas vezes em paralelo: o índice único
  // barra o segundo INSERT e quem perdeu relê o contrato do vencedor.
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
        hashOriginal: createHash("sha256").update(pdf).digest("hex"),
        dadosHash,
        enviadoEm: agora,
      })
      .returning({ id: parceiroContratos.id });
    await evento(novo!.id, "GENERATED");
    await evento(novo!.id, "SENT");
    return { ok: true, id: novo!.id, corpoHtml, codigo, otpVerificado: false };
  } catch (e) {
    if (!ehViolacaoDeUnicidade(e)) throw e;
  }
  const [vencedor] = await db
    .select({
      id: parceiroContratos.id,
      corpoHtml: parceiroContratos.corpoHtml,
      codigo: parceiroContratos.codigoVerificacao,
    })
    .from(parceiroContratos)
    .where(
      and(eq(parceiroContratos.parceiroId, parceiroId), inArray(parceiroContratos.status, PENDENTES)),
    )
    .limit(1);
  if (!vencedor) return { ok: false, erro: "Não foi possível gerar o contrato. Recarregue a página." };
  return { ok: true, ...vencedor, otpVerificado: false };
}

/**
 * O contrato ainda bate com o cadastro de agora? A página regenera ao abrir,
 * mas uma aba aberta antes da mudança ainda tem o texto velho — então código
 * e assinatura conferem de novo e, se mudou, cancelam o desatualizado.
 */
async function dadosAindaConferem(parceiroId: string, contratoId: string, dadosHash: string | null) {
  const p = await dadosDoParceiro(parceiroId);
  if (!p?.email) return false;
  const doc = (p.cpfCnpj ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const atual = hashDosDados({ ...p, cpfCnpj: doc, email: p.email });
  if (atual === dadosHash) return true;
  await db
    .update(parceiroContratos)
    .set({ status: "cancelado", updatedAt: new Date() })
    .where(and(eq(parceiroContratos.id, contratoId), inArray(parceiroContratos.status, PENDENTES)));
  return false;
}

/** PJ informa quem assina pela empresa (nome + CPF), declarando ter poderes. */
export async function salvarRepresentante(
  parceiroId: string,
  nome: string,
  cpf: string,
): Promise<Resultado> {
  if (nome.trim().length < 3) return { ok: false, erro: "Informe o nome completo do representante." };
  if (!isValidCpf(cpf)) return { ok: false, erro: "CPF do representante inválido." };
  await db
    .update(parceiros)
    .set({
      representanteNome: nome.trim(),
      representanteCpf: cpf.replace(/\D/g, ""),
      updatedAt: new Date(),
    })
    .where(eq(parceiros.id, parceiroId));
  await db.insert(parceiroInteracoes).values({
    parceiroId,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: `Parceiro informou o representante legal: ${nome.trim()}.`,
    metadata: { kind: "representante_informado" },
  });
  return { ok: true };
}

/** O contrato foi de fato exibido ao parceiro (chamado pelo navegador). */
export async function registrarVisualizacao(
  parceiroId: string,
  contratoId: string,
  meta: Meta,
): Promise<void> {
  const [c] = await db
    .update(parceiroContratos)
    .set({ status: "visualizado", visualizadoEm: new Date() })
    .where(
      and(
        eq(parceiroContratos.id, contratoId),
        eq(parceiroContratos.parceiroId, parceiroId),
        eq(parceiroContratos.status, "enviado"),
      ),
    )
    .returning({ id: parceiroContratos.id });
  if (c) await evento(contratoId, "LINK_OPENED", meta);
}

const NAO_E_O_PENDENTE: Resultado = {
  ok: false,
  erro: "Este contrato foi atualizado. Recarregue a página e leia a versão atual antes de assinar.",
};

/** O contrato informado é o pendente DESTE parceiro? */
const doParceiroPendente = (parceiroId: string, contratoId: string) =>
  and(
    eq(parceiroContratos.id, contratoId),
    eq(parceiroContratos.parceiroId, parceiroId),
    inArray(parceiroContratos.status, PENDENTES),
  );

export async function enviarOtp(
  parceiroId: string,
  contratoId: string,
  destinatario: { nome: string; email: string },
  meta: Meta,
): Promise<Resultado> {
  const [c] = await db
    .select({ id: parceiroContratos.id, dadosHash: parceiroContratos.dadosHash })
    .from(parceiroContratos)
    .where(doParceiroPendente(parceiroId, contratoId))
    .limit(1);
  if (!c || !(await dadosAindaConferem(parceiroId, c.id, c.dadosHash))) return NAO_E_O_PENDENTE;

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
      otpVerificadoEm: null,
    })
    .where(eq(parceiroContratos.id, c.id));

  const envio = await sendOtpContratoEmail({ ...destinatario, otp });
  if (!envio.ok) {
    return { ok: false, erro: "Não conseguimos enviar o código. Tente novamente em instantes." };
  }
  // Só conta (e entra na trilha) o código que realmente saiu.
  await evento(c.id, "OTP_SENT", meta, { email: destinatario.email });
  return { ok: true };
}

export async function verificarOtp(
  parceiroId: string,
  contratoId: string,
  otp: string,
  meta: Meta,
): Promise<Resultado> {
  const [alvo] = await db
    .select({ dadosHash: parceiroContratos.dadosHash })
    .from(parceiroContratos)
    .where(doParceiroPendente(parceiroId, contratoId))
    .limit(1);
  if (!alvo || !(await dadosAindaConferem(parceiroId, contratoId, alvo.dadosHash))) {
    return NAO_E_O_PENDENTE;
  }
  // Consome uma tentativa de forma atômica ANTES de comparar: rajadas em
  // paralelo não passam do limite.
  const [c] = await db
    .update(parceiroContratos)
    .set({ otpTentativas: sql`${parceiroContratos.otpTentativas} + 1` })
    .where(
      and(
        doParceiroPendente(parceiroId, contratoId),
        lt(parceiroContratos.otpTentativas, OTP_MAX_TENTATIVAS),
      ),
    )
    .returning({
      id: parceiroContratos.id,
      otpHash: parceiroContratos.otpHash,
      otpExpiraEm: parceiroContratos.otpExpiraEm,
    });
  if (!c) {
    const [existe] = await db
      .select({ id: parceiroContratos.id })
      .from(parceiroContratos)
      .where(doParceiroPendente(parceiroId, contratoId))
      .limit(1);
    return existe ? { ok: false, erro: "Muitas tentativas. Peça um novo código." } : NAO_E_O_PENDENTE;
  }
  if (!c.otpHash || !c.otpExpiraEm || c.otpExpiraEm < new Date()) {
    return { ok: false, erro: "Código expirado. Peça um novo código." };
  }
  const digitos = otp.replace(/\D/g, "");
  if (digitos.length !== 6 || !hashIgual(hashToken(digitos), c.otpHash)) {
    return { ok: false, erro: "Código incorreto. Confira o e-mail e tente de novo." };
  }
  // Código é de uso único: some assim que confere.
  await db
    .update(parceiroContratos)
    .set({ otpVerificado: true, otpVerificadoEm: new Date(), otpHash: null, otpExpiraEm: null })
    .where(eq(parceiroContratos.id, c.id));
  await evento(c.id, "OTP_VERIFIED", meta);
  return { ok: true };
}

/** Assinatura do PARCEIRO. Libera o portal; a via final sai na contra-assinatura. */
export async function assinarComoParceiro(
  quem: { parceiroId: string; usuarioId: string; nome: string; email: string },
  contratoId: string,
  meta: Meta,
): Promise<Resultado> {
  const { parceiroId } = quem;
  const [c] = await db
    .select({
      id: parceiroContratos.id,
      status: parceiroContratos.status,
      versaoModelo: parceiroContratos.versaoModelo,
      codigo: parceiroContratos.codigoVerificacao,
      otpVerificado: parceiroContratos.otpVerificado,
      otpVerificadoEm: parceiroContratos.otpVerificadoEm,
      hashOriginal: parceiroContratos.hashOriginal,
      dadosHash: parceiroContratos.dadosHash,
    })
    .from(parceiroContratos)
    .where(and(eq(parceiroContratos.id, contratoId), eq(parceiroContratos.parceiroId, parceiroId)))
    .limit(1);
  if (!c) return NAO_E_O_PENDENTE;
  if (ASSINADOS.includes(c.status)) return { ok: true }; // duplo clique
  if (!PENDENTES.includes(c.status)) return NAO_E_O_PENDENTE;
  if (!(await dadosAindaConferem(parceiroId, c.id, c.dadosHash))) return NAO_E_O_PENDENTE;
  if (
    !c.otpVerificado ||
    !c.otpVerificadoEm ||
    c.otpVerificadoEm.getTime() < Date.now() - OTP_VERIFICADO_MS
  ) {
    return { ok: false, erro: "A confirmação por código expirou. Peça um novo código para assinar." };
  }

  const p = await dadosDoParceiro(parceiroId);
  if (!p) return { ok: false, erro: "Parceiro não encontrado." };
  const doc = (p.cpfCnpj ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const signatario: Signatario = {
    nome: nomeContratual({ nome: p.nome, empresa: p.empresa, cpfCnpj: doc }),
    documento: formatCpfOrCnpj(doc) || doc,
    email: quem.email,
    usuarioId: quem.usuarioId,
    representante:
      doc.length === 14 && p.representanteNome
        ? `${p.representanteNome} (CPF ${formatCpfOrCnpj(p.representanteCpf)})`
        : null,
  };

  // Status, retrato do signatário e eventos numa transação: ou o contrato
  // fica assinado COM a trilha, ou não fica assinado.
  const agora = new Date();
  const assinou = await db.transaction(async (tx) => {
    const [ok] = await tx
      .update(parceiroContratos)
      .set({
        status: "assinado_parceiro",
        assinadoEm: agora,
        signatario: signatario as never,
        updatedAt: agora,
      })
      .where(and(eq(parceiroContratos.id, c.id), inArray(parceiroContratos.status, PENDENTES)))
      .returning({ id: parceiroContratos.id });
    if (!ok) return false;
    await evento(
      c.id,
      "SIGNED",
      meta,
      {
        hashOriginal: c.hashOriginal,
        versaoModelo: c.versaoModelo,
        usuarioId: quem.usuarioId,
        emailDoCodigo: quem.email,
        signatario,
      },
      agora,
      tx,
    );
    await evento(c.id, "ADMIN_SIGN_REQUESTED", {}, undefined, new Date(agora.getTime() + 1), tx);
    return true;
  });
  if (!assinou) return { ok: true };

  await db.insert(parceiroInteracoes).values({
    parceiroId,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: `Parceiro assinou o contrato de parceria (modelo v${c.versaoModelo}). Aguardando a assinatura da Credios.`,
    metadata: { kind: "contrato_assinado_parceiro", contratoId: c.id },
  });
  // Parceria formalizada: o pipeline de relacionamento vira "ativo".
  await db
    .update(parceiros)
    .set({ status: "ativo", ativoEm: sql`COALESCE(${parceiros.ativoEm}, now())`, updatedAt: new Date() })
    .where(and(eq(parceiros.id, parceiroId), sql`${parceiros.status} <> 'ativo'`));

  await sendContratoAssinadoParceiroEmail({ nome: quem.nome, email: quem.email, codigo: c.codigo });
  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.perfil, "admin"), eq(usersTable.ativo, true)));
  await sendPedidoContraAssinaturaEmail({
    para: admins.map((a) => a.email).filter(Boolean),
    parceiroNome: signatario.nome,
    parceiroId,
  });
  return { ok: true };
}

/**
 * Contra-assinatura da Credios (admin logado no CRM, com 2FA). Gera o PDF
 * final com os dois carimbos + manifesto, fecha o contrato e manda a via
 * final por e-mail às duas partes — cada uma fica com cópia própria.
 */
export async function contraAssinar(
  parceiroId: string,
  contratoId: string,
  admin: { id: string; nome: string; email: string },
  meta: Meta,
): Promise<Resultado> {
  const [c] = await db
    .select({
      id: parceiroContratos.id,
      status: parceiroContratos.status,
      codigo: parceiroContratos.codigoVerificacao,
      pdfOriginal: parceiroContratos.pdfOriginal,
      assinadoEm: parceiroContratos.assinadoEm,
      signatario: parceiroContratos.signatario,
    })
    .from(parceiroContratos)
    .where(and(eq(parceiroContratos.id, contratoId), eq(parceiroContratos.parceiroId, parceiroId)))
    .limit(1);
  if (!c) return { ok: false, erro: "Contrato não encontrado." };
  if (c.status === "concluido") return { ok: true };
  if (c.status !== "assinado_parceiro") {
    return { ok: false, erro: "O parceiro ainda não assinou — a contra-assinatura vem depois." };
  }
  if (!c.pdfOriginal || !c.assinadoEm) {
    return { ok: false, erro: "Documento original indisponível." };
  }
  const sig = c.signatario as Signatario | null;
  if (!sig) return { ok: false, erro: "Contrato sem o registro do signatário." };

  const agora = new Date();
  const trilha = await db
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
        name: sig.representante ? `${sig.nome} — por ${sig.representante}` : sig.nome,
        document: sig.documento,
        email: sig.email,
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
    // O evento da contra-assinatura entra no manifesto, mas só é gravado no
    // banco se este pedido vencer a corrida (abaixo) — sem evento órfão.
    events: [
      ...trilha,
      { event: "ADMIN_SIGNED", createdAt: agora, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null },
    ],
    verifyCode: c.codigo,
    verifyUrl: portalParceiroUrl(`/verificar/${c.codigo}`),
  });
  const pdfFinal = Buffer.from(pdf);

  const fechou = await db.transaction(async (tx) => {
    const [ok] = await tx
      .update(parceiroContratos)
      .set({
        status: "concluido",
        pdfAssinado: pdfFinal,
        hashDocumento: hash,
        crediosAssinadoEm: agora,
        crediosAssinanteId: admin.id,
        crediosAssinanteNome: admin.nome,
        updatedAt: agora,
      })
      .where(and(eq(parceiroContratos.id, c.id), eq(parceiroContratos.status, "assinado_parceiro")))
      .returning({ id: parceiroContratos.id });
    if (!ok) return false;
    await evento(c.id, "ADMIN_SIGNED", meta, { adminId: admin.id, adminName: admin.nome, hashFinal: hash }, agora, tx);
    return true;
  });
  if (!fechou) return { ok: true };

  await db.insert(parceiroInteracoes).values({
    parceiroId,
    autorId: admin.id,
    tipo: "evento_sistema",
    conteudo: `Contrato de parceria concluído — contra-assinado por ${admin.nome}.`,
    metadata: { kind: "contrato_concluido", contratoId: c.id },
  });
  await sendContratoConcluidoEmail({
    nome: sig.nome,
    para: [sig.email, admin.email],
    codigo: c.codigo,
    hash,
    pdf: pdfFinal,
  });
  return { ok: true };
}

/**
 * Admin cancela um contrato ainda não concluído (pendente ou só assinado pelo
 * parceiro) — ex.: dado errado no cadastro. O parceiro volta a precisar
 * assinar; o cancelado fica guardado com a trilha.
 */
export async function cancelarContrato(
  parceiroId: string,
  contratoId: string,
  admin: { id: string; nome: string },
  meta: Meta,
): Promise<Resultado> {
  const [c] = await db
    .update(parceiroContratos)
    .set({ status: "cancelado", updatedAt: new Date() })
    .where(
      and(
        eq(parceiroContratos.id, contratoId),
        eq(parceiroContratos.parceiroId, parceiroId),
        inArray(parceiroContratos.status, [...PENDENTES, "assinado_parceiro"]),
      ),
    )
    .returning({ id: parceiroContratos.id });
  if (!c) return { ok: false, erro: "Só dá pra cancelar contrato ainda não concluído." };
  await evento(c.id, "CANCELLED", meta, { adminId: admin.id, adminName: admin.nome });
  await db.insert(parceiroInteracoes).values({
    parceiroId,
    autorId: admin.id,
    tipo: "evento_sistema",
    conteudo: `Contrato de parceria cancelado por ${admin.nome}. O parceiro precisará assinar de novo.`,
    metadata: { kind: "contrato_cancelado", contratoId: c.id },
  });
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
