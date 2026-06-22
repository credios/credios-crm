import "server-only";

import { Resend } from "resend";

import { renderEmailLayout } from "@/lib/notifications/email-layout";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
const replyTo = process.env.EMAIL_REPLY_TO;
const resend = apiKey ? new Resend(apiKey) : null;

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

/**
 * E-mail personalizado que convida o cliente a enviar a documentação pelo
 * portal. Tom: tranquilizador — a proposta JÁ está em andamento, pode enviar
 * aos poucos, ambiente seguro (LGPD), e um consultor entra em contato.
 */
export async function sendPortalEmail(input: {
  nome: string;
  email: string;
  url: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };

  const nome = primeiroNome(input.nome);

  const contentHtml = `
    <div style="background:#eef3fe;border:1px solid #dce6fd;border-radius:14px;padding:18px 20px;margin:0 0 20px">
      <p style="margin:0;color:#213d80;font-size:15px;line-height:1.6;font-family:Inter,Arial,sans-serif">
        <strong>Sua proposta já está sendo trabalhada.</strong> Pra acelerar a análise e
        já buscar as melhores condições com os bancos parceiros, criamos um espaço seguro
        com a lista exata de documentos do seu caso.
      </p>
    </div>

    <p style="margin:0 0 14px;color:#3f4a5a;font-size:15px;line-height:1.6;font-family:Inter,Arial,sans-serif">
      É rápido e você não precisa de tudo agora:
    </p>
    <ul style="margin:0 0 20px;padding-left:18px;color:#3f4a5a;font-size:15px;line-height:1.7;font-family:Inter,Arial,sans-serif">
      <li><strong>Envie aos poucos.</strong> Mandou o que tinha em mãos? Pode fechar e voltar depois — salvamos tudo.</li>
      <li><strong>Só o que o seu caso pede.</strong> A lista já vem personalizada pra você, sem papelada à toa.</li>
      <li><strong>Com segurança.</strong> Seus documentos ficam protegidos e usados só para a análise da sua proposta (LGPD).</li>
    </ul>

    <p style="margin:0 0 4px;color:#3f4a5a;font-size:15px;line-height:1.6;font-family:Inter,Arial,sans-serif">
      Em breve um consultor da Credios entra em contato pra te acompanhar de perto. Qualquer
      documento que faltar, a gente resolve junto.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: "Adiante sua proposta — envie seus documentos com segurança, no seu tempo.",
    eyebrow: "SUA PROPOSTA",
    title: `${nome}, vamos adiantar sua proposta`,
    intro: "Reunimos num só lugar, seguro, a lista exata de documentos do seu caso.",
    contentHtml,
    ctas: [{ href: input.url, label: "Enviar meus documentos", tone: "primary" }],
  });

  try {
    const result = await resend.emails.send({
      from,
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
