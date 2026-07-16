import "server-only";

import { Resend } from "resend";

import {
  CLIENT_EMAIL_FROM,
  renderClientEmail,
} from "@/lib/notifications/client-email";
import {
  appUrl,
  detailsSection,
  escape,
  renderEmailLayout,
} from "@/lib/notifications/email-layout";
import {
  PARCEIRO_SEGMENTO_LABEL,
  type ParceiroSegmento,
} from "@/lib/parceiros/constants";

// E-mails do módulo de Parceiros. Duas pontas:
//   - admin: candidato novo chegou (triagem é do admin, não roteia)
//   - candidato: auto-reply "recebemos, retornamos em 1 dia útil"
// Falha silenciosa (loga e segue) — webhook nunca quebra por e-mail.

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
const replyTo = process.env.EMAIL_REPLY_TO;
const resend = apiKey ? new Resend(apiKey) : null;

type Candidato = {
  id: string;
  nome: string;
  email: string | null;
  whatsapp: string | null;
  segmento: string | null;
  cidade: string | null;
  estado: string | null;
  mensagem: string | null;
};

function segmentoLabel(s: string | null): string {
  if (!s) return "—";
  return PARCEIRO_SEGMENTO_LABEL[s as ParceiroSegmento] ?? s;
}

/** Notifica admins: candidato a parceiro chegou (fila de triagem). */
export async function sendParceiroCandidatoEmail(
  candidato: Candidato,
  recipients: string[],
): Promise<void> {
  if (!resend || recipients.length === 0) return;
  try {
    const html = renderEmailLayout({
      preheader: `Candidato a parceiro: ${candidato.nome}`,
      eyebrow: "Parceiros",
      title: "Novo candidato a parceiro",
      intro:
        "Chegou pela página de parceiros e está aguardando a sua triagem no CRM.",
      contentHtml: detailsSection("Dados do candidato", [
        ["Nome", escape(candidato.nome)],
        ["Segmento", escape(segmentoLabel(candidato.segmento))],
        ["WhatsApp", candidato.whatsapp ? escape(candidato.whatsapp) : null],
        ["E-mail", candidato.email ? escape(candidato.email) : null],
        [
          "Cidade/UF",
          [candidato.cidade, candidato.estado].filter(Boolean).join("/") || null,
        ],
        ["Mensagem", candidato.mensagem ? escape(candidato.mensagem) : null],
      ]),
      ctas: [
        {
          href: appUrl(`/parceiros/${candidato.id}`),
          label: "Fazer triagem no CRM",
        },
      ],
    });
    const r = await resend.emails.send({
      from,
      to: recipients,
      replyTo,
      subject: `Candidato a parceiro: ${candidato.nome}`,
      html,
    });
    if (r.error) console.error("[parceiros/email] admin:", r.error);
  } catch (err) {
    console.error("[parceiros/email] admin falhou:", err);
  }
}

/** Auto-reply ao candidato: recebemos, retornamos em 1 dia útil. */
export async function sendParceiroAutoReplyEmail(candidato: {
  nome: string;
  email: string;
}): Promise<void> {
  if (!resend) return;
  const primeiroNome = candidato.nome.trim().split(/\s+/)[0] || candidato.nome;
  try {
    const html = renderClientEmail({
      preheader: "Nosso time comercial retorna em até 1 dia útil.",
      title: `${primeiroNome}, recebemos o seu interesse!`,
      bodyHtml:
        `<p style="margin:0 0 16px;color:#475467;font-size:15px;line-height:1.65">` +
        `Obrigado por querer fazer parte do programa de parceiros da Credios. ` +
        `Nosso time comercial vai analisar o seu perfil e entrar em contato em até ` +
        `<strong>1 dia útil</strong> para conversar sobre a parceria — remuneração ` +
        `atrativa, transparência total e todo o processo de crédito por nossa conta.</p>`,
      footer:
        "Credios · Crédito com Garantia de Imóvel · Blumenau/SC — você recebeu " +
        "este e-mail porque preencheu o formulário de parceiros em credios.com.br",
    });
    const r = await resend.emails.send({
      from: CLIENT_EMAIL_FROM,
      to: [candidato.email],
      replyTo,
      subject: "Recebemos o seu interesse — Programa de Parceiros Credios",
      html,
    });
    if (r.error) console.error("[parceiros/email] auto-reply:", r.error);
  } catch (err) {
    console.error("[parceiros/email] auto-reply falhou:", err);
  }
}
