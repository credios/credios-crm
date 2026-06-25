import "server-only";

import { Resend } from "resend";

import type { InferSelectModel } from "drizzle-orm";
import type { leads as leadsTable } from "../../../db/schema";
import {
  appUrl,
  calcLtv,
  detailsSection,
  formatCpf,
  kpiRow,
  pill,
  renderEmailLayout,
} from "@/lib/notifications/email-layout";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "crm@credios.com.br";
const replyTo = process.env.EMAIL_REPLY_TO;

const resend = apiKey ? new Resend(apiKey) : null;

type Lead = InferSelectModel<typeof leadsTable>;

function formatBrl(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

/**
 * Notifica admins por e-mail sobre cada novo lead que entra no CRM,
 * independente do horário comercial. Falha silenciosamente (apenas loga) —
 * webhook não pode quebrar por causa de e-mail.
 *
 * Envio paralelo ao sendLeadAssignedEmail: o consultor atribuído recebe
 * a notificação dele (com SLA de 30min); admins recebem ESTE e-mail
 * pra ter visão de pipeline em tempo real.
 */
export async function sendNewLeadEmail(
  lead: Lead,
  recipients: string[],
): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  if (recipients.length === 0)
    return { ok: false, reason: "nenhum destinatário" };

  const valor = formatBrl(lead.valorCreditoCentavos);
  const subject = `Novo lead: ${lead.nome} — ${valor}`;
  const html = renderNewLeadEmail({ lead });

  try {
    const result = await resend.emails.send({
      from,
      to: recipients,
      replyTo,
      subject,
      html,
    });
    if (result.error) {
      console.error("[email] resend error:", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}

/**
 * Email pro CONSULTOR notificando que um lead novo foi atribuído a ele.
 * Disparado em qualquer atribuição (webhook com routing rule OU atribuição
 * manual via admin), independente do horário comercial.
 */
export async function sendLeadAssignedEmail(
  lead: Lead,
  recipientEmail: string,
  recipientNome: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  if (!recipientEmail) return { ok: false, reason: "destinatário vazio" };

  const subject = `Novo lead pra você: ${lead.nome}`;
  const html = renderLeadAssignedEmail({ lead, consultorNome: recipientNome });

  try {
    const result = await resend.emails.send({
      from,
      to: recipientEmail,
      replyTo,
      subject,
      html,
    });
    if (result.error) {
      console.error("[email-assigned] resend error:", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email-assigned] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}

/**
 * Alerta operacional por e-mail: o atendimento automático do WhatsApp (Heloísa)
 * pode estar sem responder. Disparado pelo cron de health-check. Destinatário em
 * `WHATSAPP_ALERT_EMAIL` (default gabriel.meirelles@credios.com.br).
 */
export async function sendWhatsappHealthEmail(
  pendentes: number,
  exemplos: string[],
): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  const to = process.env.WHATSAPP_ALERT_EMAIL ?? "gabriel.meirelles@credios.com.br";
  const subject = `⚠️ Heloísa (WhatsApp) pode estar sem responder — ${pendentes} cliente(s)`;
  const itens = exemplos.map((e) => `<li>${e}</li>`).join("");
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">
      <h2 style="color:#b91c1c;margin-bottom:8px">⚠️ Atendimento automático do WhatsApp pode estar com problema</h2>
      <p><strong>${pendentes} cliente(s)</strong> mandaram mensagem e a Heloísa não respondeu (há 30min+). Isso costuma indicar token do Meta expirado, instabilidade do Meta, ou erro no bot.</p>
      ${itens ? `<ul>${itens}</ul>` : ""}
      <p><strong>O que verificar:</strong> o token <code>WHATSAPP_ACCESS_TOKEN</code> na Vercel e o status do número no Meta. A conversa de cada lead aparece na ficha dele no CRM.</p>
      <p style="color:#666;font-size:13px;margin-top:16px">Alerta automático do health-check da Heloísa (roda a cada 2h).</p>
    </div>`;
  try {
    const result = await resend.emails.send({ from, to, replyTo, subject, html });
    if (result.error) {
      console.error("[email-health] resend error:", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email-health] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Alerta de FALHA PROATIVA: o bot tentou abrir conversa com leads e o Meta
 * rejeitou TODOS os envios. Disparado pelo cron proativo (a cada 5 min, com
 * throttle de 2h). Cobre o ponto cego do health-check reativo — uma queda do
 * proativo não gera resposta de cliente, então nada a detectaria de outra forma.
 */
export async function sendProativoFailureEmail(
  candidatos: number,
  erro: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  const to = process.env.WHATSAPP_ALERT_EMAIL ?? "gabriel.meirelles@credios.com.br";
  const subject = `🚨 Bot WhatsApp NÃO está enviando — ${candidatos} lead(s) sem abertura`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">
      <h2 style="color:#b91c1c;margin-bottom:8px">🚨 O bot proativo da Heloísa parou de enviar</h2>
      <p>Nos últimos minutos, <strong>${candidatos} lead(s)</strong> deveriam receber a mensagem de abertura e <strong>nenhum</strong> foi enviado — o Meta rejeitou os envios. Novos leads não estão sendo abordados.</p>
      <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px"><strong>Erro do Meta:</strong><br><code style="font-size:12px;word-break:break-word">${escapeHtml(erro)}</code></p>
      <p><strong>O que costuma ser:</strong> token <code>WHATSAPP_ACCESS_TOKEN</code> expirado (190), app despublicado/restrito (131030 / policy) ou conta/billing do Meta (13104x).</p>
      <p style="color:#666;font-size:13px;margin-top:16px">Alerta automático do cron proativo (a cada 5 min; no máx. 1 e-mail a cada 2h).</p>
    </div>`;
  try {
    const result = await resend.emails.send({ from, to, replyTo, subject, html });
    if (result.error) {
      console.error("[email-proativo] resend error:", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email-proativo] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}

// ============================================================================
// Construção do bloco de detalhes do lead (compartilhado entre emails)
// ============================================================================

/** Detecta o primeiro click ID disponível e devolve label legível.  */
function describeClickId(lead: Lead): string | null {
  if (lead.gclid) return `Google Ads (gclid)`;
  if (lead.wbraid) return `Google Ads iOS (wbraid)`;
  if (lead.gbraid) return `Google Ads iOS (gbraid)`;
  if (lead.fbclid) return `Meta (fbclid)`;
  if (lead.msclkid) return `Microsoft Ads (msclkid)`;
  if (lead.ttclid) return `TikTok Ads (ttclid)`;
  return null;
}

/**
 * Formata o saldo devedor do imóvel quando aplicável (situacaoImovel =
 * "Financiado" e valor > 0). Imóveis quitados ficam null por design.
 */
function formatSaldoDevedor(lead: Lead): string | null {
  if (!lead.saldoDevedorCentavos || lead.saldoDevedorCentavos <= 0) return null;
  return formatBrl(lead.saldoDevedorCentavos);
}

/**
 * Monta o HTML completo de detalhes do lead, agrupado em 4 seções:
 *   1. Contato — WhatsApp, email, localização
 *   2. Dados pessoais — CPF, estado civil, ocupação, renda, PF/PJ
 *   3. Operação — produto, objetivo, imóvel, valores, LTV
 *   4. Origem & tracking — origem, UTM, click ID, página de entrada
 *
 * Seções com todos os campos vazios são automaticamente omitidas, pra que
 * leads enxutos (ex: vindo de form simples) não gerem blocos com tudo "—".
 */
function buildLeadDetailsHtml(lead: Lead): string {
  const cidadeUf = [lead.cidade, lead.estado].filter(Boolean).join(" / ");
  const horario = lead.createdAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const ltv = calcLtv(lead.valorCreditoCentavos, lead.valorImovelCentavos);
  const clickIdLabel = describeClickId(lead);

  const contato = detailsSection("Contato", [
    ["WhatsApp", lead.whatsapp],
    ["E-mail", lead.email],
    ["Cidade / UF", cidadeUf],
  ]);

  const pessoais = detailsSection("Dados pessoais", [
    ["CPF", formatCpf(lead.cpf)],
    ["Estado civil", lead.estadoCivil],
    ["Ocupação", lead.ocupacao],
    ["Renda mensal", lead.rendaMensalCentavos != null ? formatBrl(lead.rendaMensalCentavos) : null],
    ["Tipo de pessoa", lead.tipoPessoa],
  ]);

  const operacao = detailsSection("Operação", [
    ["Produto", lead.produto],
    ["Objetivo do crédito", lead.objetivoCredito],
    ["Tipo de imóvel", lead.tipoImovel],
    // Aparece só pra Terreno/Outro — categorias de aceitação restrita,
    // onde o esclarecimento é crítico pra triagem do consultor.
    ["Esclarecimento sobre o imóvel", lead.tipoImovelDetalhes],
    ["Situação do imóvel", lead.situacaoImovel],
    ["Valor do imóvel", lead.valorImovelCentavos != null ? formatBrl(lead.valorImovelCentavos) : null],
    ["Saldo devedor", formatSaldoDevedor(lead)],
    ["Crédito buscado", lead.valorCreditoCentavos != null ? formatBrl(lead.valorCreditoCentavos) : null],
    ["LTV", ltv],
  ]);

  const tracking = detailsSection("Origem & tracking", [
    ["Origem", lead.origem],
    ["Click ID", clickIdLabel],
    ["Campanha (utm_campaign)", lead.utmCampaign],
    ["Mídia (utm_source / medium)", [lead.utmSource, lead.utmMedium].filter(Boolean).join(" / ")],
    ["Palavra-chave", lead.palavraChave ?? lead.utmTerm],
    ["Grupo de anúncios", lead.grupoAnuncios],
    ["Criativo", lead.criativo ?? lead.utmContent],
    ["Tipo de correspondência", lead.tipoCorrespondencia],
    ["Rede", lead.rede],
    ["Dispositivo", lead.dispositivo],
    ["Página de entrada", lead.paginaEntrada],
    ["Referrer", lead.referrer],
    ["Recebido em", `${horario} (BRT)`],
  ]);

  return `${contato}${pessoais}${operacao}${tracking}`;
}

/** Linha de KPIs padrão (Valor buscado + LTV se houver + Renda se houver). */
function buildLeadKpis(lead: Lead) {
  const items: Array<{ label: string; value: string; tone?: "info" | "warning" | "success" }> = [
    {
      label: "Valor buscado",
      value: formatBrl(lead.valorCreditoCentavos),
      tone: "info",
    },
  ];
  const ltv = calcLtv(lead.valorCreditoCentavos, lead.valorImovelCentavos);
  if (ltv) items.push({ label: "LTV", value: ltv, tone: "warning" });
  if (lead.rendaMensalCentavos != null) {
    items.push({
      label: "Renda mensal",
      value: formatBrl(lead.rendaMensalCentavos),
      tone: "success",
    });
  }
  return kpiRow(items);
}

export function renderLeadAssignedEmail(params: {
  lead: Lead;
  consultorNome: string;
}): string {
  const { lead, consultorNome } = params;
  const cidadeUf =
    [lead.cidade, lead.estado].filter(Boolean).join(" / ") || "—";
  const wpHref = lead.whatsapp
    ? `https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`
    : null;

  const ctas: Array<{ href: string; label: string; tone?: "primary" | "secondary" }> = [
    { href: appUrl(`/leads/${lead.id}`), label: "Abrir lead no CRM" },
  ];
  if (wpHref) ctas.push({ href: wpHref, label: "WhatsApp", tone: "secondary" });

  const primeiroNome = consultorNome.split(" ")[0] || consultorNome;

  // Badge especial pra leads de Google Ads — replicando comportamento do
  // antigo email do site (era "[GADS]" no subject).
  const isGoogleAds = lead.origem === "Google Ads" || !!lead.gclid;
  const eyebrowExtra = isGoogleAds
    ? `<div style="margin:0 0 8px">${pill("Google Ads", "warning")}</div>`
    : "";

  return renderEmailLayout({
    preheader: `${lead.nome} — ${formatBrl(lead.valorCreditoCentavos)} buscado, ${cidadeUf}`,
    eyebrow: "Lead atribuído a você",
    eyebrowTone: "info",
    title: lead.nome,
    intro: `Olá, ${primeiroNome}. Você acabou de receber este lead. SLA de 30min começa agora — entre em contato pelo WhatsApp ou ligue assim que possível.`,
    contentHtml: `${eyebrowExtra}${buildLeadKpis(lead)}${buildLeadDetailsHtml(lead)}`,
    ctas,
  });
}

export function renderNewLeadEmail(params: { lead: Lead }): string {
  const { lead } = params;
  const cidadeUf = [lead.cidade, lead.estado].filter(Boolean).join(" / ") || "—";
  const wpHref = lead.whatsapp
    ? `https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`
    : null;

  const ctas: Array<{ href: string; label: string; tone?: "primary" | "secondary" }> = [
    { href: appUrl(`/leads/${lead.id}`), label: "Abrir lead no CRM" },
  ];
  if (wpHref) ctas.push({ href: wpHref, label: "Abrir WhatsApp", tone: "secondary" });

  const isGoogleAds = lead.origem === "Google Ads" || !!lead.gclid;
  const eyebrowExtra = isGoogleAds
    ? `<div style="margin:0 0 8px">${pill("Google Ads", "warning")}</div>`
    : "";

  return renderEmailLayout({
    preheader: `${lead.nome} — ${formatBrl(lead.valorCreditoCentavos)} buscado, ${cidadeUf}`,
    eyebrow: "Novo lead",
    eyebrowTone: "info",
    title: lead.nome,
    intro:
      "Lead acabou de entrar no CRM via site. Confira os detalhes abaixo e abra o lead pra acompanhar o atendimento.",
    contentHtml: `${eyebrowExtra}${buildLeadKpis(lead)}${buildLeadDetailsHtml(lead)}`,
    ctas,
  });
}

/**
 * E-mail de ENRIQUECIMENTO — disparado quando um lead que entrou parcial
 * (1ª etapa do simulador inline: nome, telefone, valores) completa o restante
 * do cadastro (2ª etapa). Conteúdo DIFERENTE do "Novo lead" pra não parecer
 * duplicado: sinaliza "cadastro completo" e traz os dados que faltavam (CPF,
 * renda, objetivo, situação do imóvel). Vai pros admins + consultor atribuído.
 */
export async function sendLeadEnrichedEmail(
  lead: Lead,
  recipients: string[],
): Promise<{ ok: boolean; reason?: string }> {
  if (!resend) return { ok: false, reason: "RESEND_API_KEY ausente" };
  if (recipients.length === 0)
    return { ok: false, reason: "nenhum destinatário" };

  const valor = formatBrl(lead.valorCreditoCentavos);
  const subject = `Cadastro completo: ${lead.nome} — ${valor}`;
  const html = renderLeadEnrichedEmail({ lead });

  try {
    const result = await resend.emails.send({
      from,
      to: recipients,
      replyTo,
      subject,
      html,
    });
    if (result.error) {
      console.error("[email-enriched] resend error:", result.error);
      return { ok: false, reason: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email-enriched] envio falhou:", err);
    return { ok: false, reason: err instanceof Error ? err.message : "erro" };
  }
}

export function renderLeadEnrichedEmail(params: { lead: Lead }): string {
  const { lead } = params;
  const cidadeUf = [lead.cidade, lead.estado].filter(Boolean).join(" / ") || "—";
  const wpHref = lead.whatsapp
    ? `https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`
    : null;

  const ctas: Array<{ href: string; label: string; tone?: "primary" | "secondary" }> = [
    { href: appUrl(`/leads/${lead.id}`), label: "Abrir lead no CRM" },
  ];
  if (wpHref) ctas.push({ href: wpHref, label: "Abrir WhatsApp", tone: "secondary" });

  const isGoogleAds = lead.origem === "Google Ads" || !!lead.gclid;
  const eyebrowExtra = isGoogleAds
    ? `<div style="margin:0 0 8px">${pill("Google Ads", "warning")}</div>`
    : "";

  return renderEmailLayout({
    preheader: `${lead.nome} completou o cadastro — ${formatBrl(lead.valorCreditoCentavos)}, ${cidadeUf}`,
    eyebrow: "Cadastro completo",
    eyebrowTone: "success",
    title: lead.nome,
    intro:
      "Este lead já tinha entrado pelo simulador e agora completou o restante do cadastro. Os dados que faltavam — CPF, renda, objetivo e situação do imóvel — estão abaixo.",
    contentHtml: `${eyebrowExtra}${buildLeadKpis(lead)}${buildLeadDetailsHtml(lead)}`,
    ctas,
  });
}
