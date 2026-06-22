/**
 * Layout ÚNICO dos e-mails que o CLIENTE recebe (padronizado entre site e CRM).
 *
 * Design: fundo gradiente azul-escuro Credios + logo branco no topo + um bloco
 * branco arredondado com o texto clean + um único CTA azul. Simples, premium,
 * sem poluição gráfica. NÃO usar para e-mails internos (esses seguem no layout
 * denso de pipeline).
 *
 * Espelhado em credios-website-v2/src/lib/client-email.ts — manter os dois iguais.
 */

export const CLIENT_EMAIL_FROM = "Credios <cliente@credios.com.br>";
export const CREDIOS_LOGO_WHITE = "https://www.credios.com.br/credios-logo-white.png";

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export type ClientEmailProps = {
  /** Snippet de preview no inbox. */
  preheader: string;
  /** Título dentro do card branco. */
  title: string;
  /** Parágrafo de abertura, opcional. */
  intro?: string;
  /** HTML do corpo (parágrafos/listas já estilizados clean). */
  bodyHtml: string;
  /** CTA único no fim do card. */
  cta?: { href: string; label: string };
  /** Texto pequeno do rodapé (sobre o gradiente). */
  footer?: string;
};

export function renderClientEmail(p: ClientEmailProps): string {
  const intro = p.intro
    ? `<p style="margin:0 0 20px;color:#475467;font-size:16px;line-height:1.65;font-family:${FONT}">${p.intro}</p>`
    : "";

  const cta = p.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto 4px">
         <tr><td align="center" bgcolor="#2f55c7" style="border-radius:12px">
           <a href="${p.cta.href}" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:12px">${p.cta.label}</a>
         </td></tr>
       </table>`
    : "";

  const footer = p.footer
    ? `<p style="margin:22px auto 0;max-width:480px;text-align:center;color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;font-family:${FONT}">${p.footer}</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="dark light">
<title>${p.title}</title></head>
<body style="margin:0;padding:0;background-color:#0a1730;-webkit-font-smoothing:antialiased">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;color:transparent">${p.preheader}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0a1730" style="background-color:#0a1730;background-image:linear-gradient(160deg,#173463 0%,#0d2148 42%,#0a1530 100%)">
  <tr><td align="center" style="padding:42px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;width:100%">
      <tr><td align="center" style="padding:0 0 28px">
        <img src="${CREDIOS_LOGO_WHITE}" alt="Credios" width="146" height="47" style="display:block;width:146px;height:auto;border:0;outline:none">
      </td></tr>
      <tr><td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background:#ffffff;border-radius:22px">
          <tr><td style="padding:38px 36px">
            <h1 style="margin:0 0 16px;color:#0f1b3d;font-size:23px;line-height:1.25;font-weight:800;font-family:${FONT}">${p.title}</h1>
            ${intro}
            ${p.bodyHtml}
            ${cta}
          </td></tr>
        </table>
      </td></tr>
      <tr><td>${footer}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
