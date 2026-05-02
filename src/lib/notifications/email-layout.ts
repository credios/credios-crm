// Helpers de email HTML — layout único, branding Credios consistente.
// Compatível com Outlook, Gmail e Apple Mail (inline styles, table-based
// layout em alguns lugares pra robustez, sem flexbox/grid).
//
// Cores espelhadas do app (globals.css):
//   blue #4b7be5 · gold #d4a351 · charcoal #141e30 · ivory #f8f6f0

const COLORS = {
  blue: "#4b7be5",
  blueDark: "#2c4fa8",
  blueSoft: "#eaf0fc",
  gold: "#d4a351",
  goldSoft: "#fbf2dc",
  charcoal: "#141e30",
  charcoalSoft: "#5a6478",
  ivory: "#f8f6f0",
  ivoryDark: "#efebde",
  white: "#ffffff",
  border: "#e1ddcf",
  borderStrong: "#c8c2ad",
  text: "#141e30",
  textMuted: "#6b6f7e",
  success: "#10b981",
  successSoft: "#d1fae5",
  warning: "#d4a351",
  warningSoft: "#fbf2dc",
  danger: "#dc2626",
  dangerSoft: "#fee2e2",
} as const;

export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

const LOGO_URL = appUrl("/credios-logo.png");

type Tone = "primary" | "secondary" | "success" | "warning" | "danger" | "info";

const PILL_TONES: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: COLORS.blueSoft, fg: COLORS.blueDark },
  secondary: { bg: "#eef0f4", fg: COLORS.charcoalSoft },
  success: { bg: COLORS.successSoft, fg: "#065f46" },
  warning: { bg: COLORS.goldSoft, fg: "#92660d" },
  danger: { bg: COLORS.dangerSoft, fg: "#991b1b" },
  info: { bg: COLORS.blueSoft, fg: COLORS.blueDark },
};

export function pill(text: string, tone: Tone = "secondary"): string {
  const c = PILL_TONES[tone];
  return `<span style="display:inline-block;border-radius:999px;padding:3px 9px;background:${c.bg};color:${c.fg};font-size:11px;font-weight:700;font-family:Inter,Arial,sans-serif;letter-spacing:0.02em;line-height:1.4;vertical-align:middle">${escape(text)}</span>`;
}

type ButtonProps = { href: string; label: string; tone?: "primary" | "secondary" };
export function button({ href, label, tone = "primary" }: ButtonProps): string {
  const isPrimary = tone === "primary";
  const bg = isPrimary ? COLORS.blue : COLORS.white;
  const color = isPrimary ? COLORS.white : COLORS.charcoal;
  const border = isPrimary ? COLORS.blue : COLORS.borderStrong;
  return `<a href="${href}" style="display:inline-block;background:${bg};color:${color};border:1px solid ${border};text-decoration:none;border-radius:8px;padding:11px 18px;font-weight:700;font-size:14px;font-family:Inter,Arial,sans-serif;line-height:1">${escape(label)}</a>`;
}

export function divider(): string {
  return `<div style="height:1px;background:${COLORS.border};margin:20px 0"></div>`;
}

type LeadCardData = {
  nome: string;
  valor?: string | null;
  rendaOuImovel?: string | null;
  cidadeUf?: string | null;
  origem?: string | null;
  hint?: string | null;
  href: string;
};

export function leadCard(d: LeadCardData): string {
  const meta = [
    d.valor ? `<strong style="color:${COLORS.charcoal}">${escape(d.valor)}</strong>` : null,
    d.rendaOuImovel ? escape(d.rendaOuImovel) : null,
    d.cidadeUf ? escape(d.cidadeUf) : null,
    d.origem ? `<span style="color:${COLORS.blueDark}">${escape(d.origem)}</span>` : null,
  ]
    .filter(Boolean)
    .join(` <span style="color:${COLORS.borderStrong}">·</span> `);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px"><tr><td style="background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:10px;padding:14px 16px">
    <a href="${d.href}" style="text-decoration:none;color:${COLORS.charcoal};display:block">
      <div style="font-size:15px;font-weight:700;font-family:'Plus Jakarta Sans',Inter,Arial,sans-serif;line-height:1.3;color:${COLORS.charcoal};margin:0 0 6px">${escape(d.nome)}</div>
      <div style="font-size:13px;color:${COLORS.textMuted};font-family:Inter,Arial,sans-serif;line-height:1.5">${meta}</div>
      ${d.hint ? `<div style="margin-top:8px">${pill(d.hint, "warning")}</div>` : ""}
    </a>
  </td></tr></table>`;
}

type KpiRowItem = { label: string; value: string; tone?: Tone };
export function kpiRow(items: KpiRowItem[]): string {
  const cells = items
    .map((it) => {
      const c = it.tone ? PILL_TONES[it.tone].fg : COLORS.charcoal;
      return `<td style="padding:14px 12px;background:${COLORS.ivory};border:1px solid ${COLORS.border};border-radius:8px;text-align:center;width:${Math.floor(100 / items.length)}%">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.textMuted};font-family:Inter,Arial,sans-serif;font-weight:700;margin-bottom:4px">${escape(it.label)}</div>
        <div style="font-size:22px;font-weight:700;color:${c};font-family:'Plus Jakarta Sans',Inter,Arial,sans-serif;line-height:1.1">${escape(it.value)}</div>
      </td>`;
    })
    .join(`<td style="width:8px"></td>`);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 18px"><tr>${cells}</tr></table>`;
}

type RenderProps = {
  /** Texto curto que aparece no preview do client (Gmail "snippet"). */
  preheader: string;
  /** Eyebrow acima do título (ex: "ALERTA SLA"). */
  eyebrow?: string;
  /** Título principal. */
  title: string;
  /** Parágrafo curto de contexto, opcional. */
  intro?: string;
  /** HTML do corpo (cards, listas, KPIs etc). */
  contentHtml: string;
  /** Botões CTA no rodapé do card. */
  ctas?: ButtonProps[];
  /** Tom destacado pra eyebrow (alerta, sucesso, etc). */
  eyebrowTone?: Tone;
};

export function renderEmailLayout(props: RenderProps): string {
  const eyebrow = props.eyebrow
    ? `<div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${
        props.eyebrowTone === "danger"
          ? COLORS.danger
          : props.eyebrowTone === "warning"
            ? "#92660d"
            : COLORS.gold
      };font-weight:700;font-family:Inter,Arial,sans-serif;margin-bottom:8px">${escape(props.eyebrow)}</div>`
    : "";

  const intro = props.intro
    ? `<p style="margin:0 0 16px;color:${COLORS.charcoalSoft};font-size:15px;line-height:1.55;font-family:Inter,Arial,sans-serif">${escape(props.intro)}</p>`
    : "";

  const ctasHtml =
    props.ctas && props.ctas.length > 0
      ? `<div style="margin-top:24px">${props.ctas.map((c) => button(c)).join('<span style="display:inline-block;width:8px"></span>')}</div>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escape(props.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.ivory};color:${COLORS.text};-webkit-font-smoothing:antialiased">
  <span style="display:none!important;visibility:hidden;opacity:0;overflow:hidden;mso-hide:all;height:0;width:0;color:transparent">${escape(props.preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.ivory}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;width:100%">
        <!-- Header com logo -->
        <tr><td style="padding:0 4px 20px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle">
                <a href="${appUrl("/")}" style="text-decoration:none;display:inline-block">
                  <img src="${LOGO_URL}" alt="Credios" width="120" height="38" style="display:block;border:0;outline:none;height:38px;width:auto">
                </a>
              </td>
              <td style="text-align:right;vertical-align:middle;font-family:Inter,Arial,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${COLORS.gold};font-weight:700">CRM</td>
            </tr>
          </table>
        </td></tr>
        <!-- Card principal -->
        <tr><td style="background:${COLORS.white};border:1px solid ${COLORS.border};border-radius:14px;padding:32px 28px;box-shadow:0 1px 3px rgba(20,30,48,0.04)">
          ${eyebrow}
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-family:'Plus Jakarta Sans',Inter,Arial,sans-serif;font-weight:700;color:${COLORS.charcoal};letter-spacing:-0.01em">${escape(props.title)}</h1>
          ${intro}
          ${props.contentHtml}
          ${ctasHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 4px 0;text-align:center;font-family:Inter,Arial,sans-serif;font-size:12px;color:${COLORS.textMuted};line-height:1.6">
          <div style="margin-bottom:6px">Você recebeu este email porque tem acesso ao CRM Credios.</div>
          <div><a href="${appUrl("/")}" style="color:${COLORS.blue};text-decoration:none">Acessar o CRM</a> · <a href="${appUrl("/perfil")}" style="color:${COLORS.blue};text-decoration:none">Preferências</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Escape HTML pra evitar injection vinda de campos livres (nome do lead,
// motivos de desqualificação etc).
export function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
