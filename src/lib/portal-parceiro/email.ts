import "server-only";

import { Resend } from "resend";

import { renderClientEmail } from "@/lib/notifications/client-email";

const apiKey = process.env.RESEND_API_KEY;
const replyTo = process.env.EMAIL_REPLY_TO;
const resend = apiKey ? new Resend(apiKey) : null;

const FROM = "Credios Parceiros <parceiros@credios.com.br>";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Base pública do portal. Na virada de domínio basta setar PORTAL_PARCEIRO_URL. */
export function portalParceiroUrl(path = ""): string {
  const base =
    process.env.PORTAL_PARCEIRO_URL ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/portal-parceiro`;
  return `${base.replace(/\/$/, "")}${path}`;
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

function p(texto: string): string {
  return `<p style="margin:0 0 16px;color:#475467;font-size:16px;line-height:1.65;font-family:${FONT}">${texto}</p>`;
}

async function enviar(input: {
  to: string;
  subject: string;
  html: string;
  tag: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  try {
    const result = await resend.emails.send({
      from: FROM,
      to: input.to,
      replyTo,
      subject: input.subject,
      html: input.html,
    });
    if (result.error) {
      console.error(`[portal-parceiro:${input.tag}] resend error:`, result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[portal-parceiro:${input.tag}] envio falhou:`, err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}

export async function sendConviteParceiroEmail(input: {
  nome: string;
  email: string;
  token: string;
}) {
  const nome = primeiroNome(input.nome);
  const html = renderClientEmail({
    preheader: "Seu acesso ao portal de parceiros da Credios está pronto — crie sua senha.",
    title: `${nome}, seu acesso ao portal está pronto`,
    bodyHtml:
      p(
        "Você foi convidado para o <strong style=\"color:#0f1b3d\">portal de parceiros da Credios</strong>. Por lá você indica clientes, acompanha cada operação e vê suas comissões.",
      ) + p("O link abaixo vale por 7 dias e só pode ser usado uma vez."),
    cta: { href: portalParceiroUrl(`/convite/${input.token}`), label: "Criar minha senha" },
    footer: "Se você não esperava este convite, pode ignorar este e-mail.",
  });
  return enviar({
    to: input.email,
    subject: "Seu acesso ao portal de parceiros da Credios",
    html,
    tag: "convite",
  });
}

export async function sendResetSenhaParceiroEmail(input: {
  nome: string;
  email: string;
  token: string;
}) {
  const nome = primeiroNome(input.nome);
  const html = renderClientEmail({
    preheader: "Link para redefinir sua senha do portal de parceiros.",
    title: `${nome}, vamos redefinir sua senha`,
    bodyHtml:
      p("Recebemos um pedido para redefinir a senha do seu acesso ao portal de parceiros.") +
      p("O link vale por 1 hora. Se não foi você, ignore este e-mail — sua senha continua a mesma."),
    cta: { href: portalParceiroUrl(`/redefinir-senha/${input.token}`), label: "Redefinir senha" },
  });
  return enviar({
    to: input.email,
    subject: "Redefinição de senha — portal de parceiros Credios",
    html,
    tag: "reset",
  });
}

export async function sendIndicacaoRecebidaEmail(input: {
  nome: string;
  email: string;
  clienteNome: string;
  leadId: string;
}) {
  const nome = primeiroNome(input.nome);
  const html = renderClientEmail({
    preheader: `Recebemos a indicação de ${input.clienteNome}.`,
    title: `${nome}, recebemos sua indicação`,
    bodyHtml:
      p(
        `A indicação de <strong style="color:#0f1b3d">${input.clienteNome}</strong> já está com a nossa equipe. Entramos em contato com o cliente em até 1 dia útil.`,
      ) + p("Você acompanha cada etapa pelo portal."),
    cta: { href: portalParceiroUrl(`/clientes/${input.leadId}`), label: "Acompanhar indicação" },
  });
  return enviar({
    to: input.email,
    subject: `Indicação recebida: ${input.clienteNome}`,
    html,
    tag: "indicacao",
  });
}

export async function sendOtpContratoEmail(input: { nome: string; email: string; otp: string }) {
  const html = renderClientEmail({
    preheader: `Seu código de assinatura: ${input.otp}`,
    title: "Código para assinar o contrato",
    bodyHtml:
      p("Use o código abaixo para confirmar sua identidade e assinar o contrato de parceria:") +
      `<p style="margin:0 0 16px;text-align:center;font-family:'Courier New',monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:#0f1b3d">${input.otp}</p>` +
      p("O código vale por 10 minutos. Se você não pediu este código, ignore este e-mail."),
  });
  return enviar({
    to: input.email,
    subject: `${input.otp} é o seu código de assinatura — Credios`,
    html,
    tag: "otp",
  });
}

export async function sendContratoAssinadoParceiroEmail(input: {
  nome: string;
  email: string;
  codigo: string;
}) {
  const html = renderClientEmail({
    preheader: "Recebemos sua assinatura. Seu acesso ao portal está liberado.",
    title: `${primeiroNome(input.nome)}, contrato assinado`,
    bodyHtml:
      p("Recebemos a sua assinatura no contrato de parceria e o seu acesso ao portal já está liberado.") +
      p(`A via final, com a assinatura da Credios, fica disponível no portal em seguida. Código de verificação: <strong style="color:#0f1b3d">${input.codigo}</strong>.`),
    cta: { href: portalParceiroUrl(""), label: "Abrir o portal" },
  });
  return enviar({ to: input.email, subject: "Contrato de parceria assinado — Credios", html, tag: "assinado" });
}

export async function sendContratoConcluidoEmail(input: {
  nome: string;
  email: string;
  codigo: string;
}) {
  const html = renderClientEmail({
    preheader: "A via final do contrato, assinada pelas duas partes, está disponível.",
    title: "Contrato de parceria concluído",
    bodyHtml:
      p("A Credios também assinou o contrato de parceria. A via final, com as duas assinaturas e a trilha de auditoria, está disponível para download no portal.") +
      p(`Qualquer pessoa pode conferir a autenticidade pelo código <strong style="color:#0f1b3d">${input.codigo}</strong>.`),
    cta: { href: portalParceiroUrl("/contrato"), label: "Baixar o contrato" },
  });
  return enviar({ to: input.email, subject: "Contrato de parceria concluído — Credios", html, tag: "concluido" });
}

/** Aviso interno: parceiro assinou, falta a contra-assinatura da Credios. */
export async function sendPedidoContraAssinaturaEmail(input: {
  para: string[];
  parceiroNome: string;
  parceiroId: string;
}) {
  if (input.para.length === 0) return { ok: true };
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/parceiros/${input.parceiroId}`;
  const html = renderClientEmail({
    preheader: `${input.parceiroNome} assinou o contrato de parceria.`,
    title: "Contrato aguardando a assinatura da Credios",
    bodyHtml: p(
      `<strong style="color:#0f1b3d">${input.parceiroNome}</strong> assinou o contrato de parceria. Falta a contra-assinatura da Credios para gerar a via final.`,
    ),
    cta: { href: url, label: "Abrir a ficha do parceiro" },
  });
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  try {
    const r = await resend.emails.send({
      from: FROM,
      to: input.para,
      replyTo,
      subject: `Contrato para contra-assinar: ${input.parceiroNome}`,
      html,
    });
    return r.error ? { ok: false, reason: r.error.message } : { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}
