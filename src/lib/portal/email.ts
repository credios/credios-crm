import "server-only";

import { Resend } from "resend";

import {
  CLIENT_EMAIL_FROM,
  renderClientEmail,
} from "@/lib/notifications/client-email";

const apiKey = process.env.RESEND_API_KEY;
const replyTo = process.env.EMAIL_REPLY_TO;
const resend = apiKey ? new Resend(apiKey) : null;

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

/**
 * E-mail personalizado que convida o cliente a enviar a documentação pelo
 * portal. Tom tranquilizador — a proposta JÁ está em andamento, pode enviar aos
 * poucos, ambiente seguro (LGPD), e um consultor entra em contato.
 */
export async function sendPortalEmail(input: {
  nome: string;
  email: string;
  url: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };

  const nome = primeiroNome(input.nome);

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#475467;font-size:16px;line-height:1.65;font-family:${FONT}">
      A <strong style="color:#0f1b3d">Credios</strong> é uma consultoria gratuita, 100% focada em
      crédito com garantia de imóvel: buscamos a melhor proposta entre 30+ bancos parceiros e
      cuidamos de tudo com você. Você não paga nada — somos remunerados pelos bancos.
    </p>
    <p style="margin:0 0 18px;color:#475467;font-size:16px;line-height:1.65;font-family:${FONT}">
      <strong style="color:#0f1b3d">Sua proposta já está sendo trabalhada.</strong> Para acelerar
      a análise, reunimos num só lugar, com segurança, a lista exata de documentos do seu caso.
    </p>
    <p style="margin:0 0 12px;color:#475467;font-size:16px;line-height:1.65;font-family:${FONT}">
      Você não precisa de tudo agora:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px">
      ${[
        ["Envie aos poucos.", "Mandou o que tinha em mãos? Pode fechar e voltar depois — salvamos tudo."],
        ["Só o que o seu caso pede.", "A lista já vem personalizada para você, sem papelada à toa."],
        ["Com segurança.", "Seus documentos ficam protegidos e usados só para a análise da sua proposta (LGPD)."],
      ]
        .map(
          ([t, d]) => `
      <tr><td style="padding:6px 0;font-family:${FONT};font-size:15px;line-height:1.55;color:#475467;vertical-align:top">
        <span style="color:#2f55c7;font-weight:700">•</span>&nbsp;
        <strong style="color:#0f1b3d">${t}</strong> ${d}
      </td></tr>`,
        )
        .join("")}
    </table>
    <p style="margin:18px 0 0;color:#475467;font-size:15px;line-height:1.65;font-family:${FONT}">
      Em breve um consultor da Credios entra em contato para te acompanhar de perto.
      Qualquer documento que faltar, a gente resolve junto.
    </p>
  `;

  const html = renderClientEmail({
    preheader: "Recebemos sua simulação — adiante sua proposta enviando seus documentos com segurança.",
    title: `${nome}, vamos adiantar sua proposta`,
    intro: "Recebemos a sua simulação — e já estamos cuidando dela.",
    bodyHtml,
    cta: { href: input.url, label: "Enviar meus documentos" },
    footer:
      "Você recebeu este e-mail porque solicitou uma simulação na Credios. Seus dados são tratados conforme a LGPD.",
  });

  try {
    const result = await resend.emails.send({
      from: CLIENT_EMAIL_FROM,
      to: input.email,
      replyTo,
      subject: `${nome}, vamos adiantar sua proposta de crédito`,
      html,
    });
    if (result.error) {
      console.error("[portal-email] resend error:", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[portal-email] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}
