// ============================================================================
// Referrer → Source parser
// ============================================================================
// Map de domínios canônicos para sources. Cobre as principais plataformas
// onde tráfego pode vir orgânico (sem click ID nem UTM).
//
// Especial atenção em AI Assistants (ChatGPT, Perplexity, Claude, etc) —
// segmento que mais cresce em 2024-2026 pra B2C high-ticket. Cada domínio
// vira um source separado pra permitir análise granular.
// ============================================================================

import type { Channel } from "./taxonomy";

export type ReferrerMatch = {
  source: string;
  channel: Channel;
  paid: boolean;
};

/**
 * Map: hostname (sem www) → { source, channel, paid }.
 *
 * Padrão: tráfego de domínios reconhecidos é orgânico (paid: false). Se vier
 * com click ID, a chain de click ID sobrescreve (e marca como paid).
 *
 * Para domínios com subpath relevante (ex: bing.com/chat vs bing.com puro),
 * a função `parseReferrer` faz checks adicionais via URL completa.
 */
const REFERRER_MAP: Record<string, ReferrerMatch> = {
  // ── Buscadores (Organic Search) ──────────────────────────────────────────
  "google.com":              { source: "Google",      channel: "Organic Search", paid: false },
  "google.com.br":           { source: "Google",      channel: "Organic Search", paid: false },
  "www.google.com":          { source: "Google",      channel: "Organic Search", paid: false },
  "bing.com":                { source: "Bing",        channel: "Organic Search", paid: false },
  "yahoo.com":               { source: "Yahoo",       channel: "Organic Search", paid: false },
  "br.search.yahoo.com":     { source: "Yahoo",       channel: "Organic Search", paid: false },
  "duckduckgo.com":          { source: "DuckDuckGo",  channel: "Organic Search", paid: false },

  // ── Meta (Organic Social) ────────────────────────────────────────────────
  "instagram.com":           { source: "Instagram",   channel: "Organic Social", paid: false },
  "l.instagram.com":         { source: "Instagram",   channel: "Organic Social", paid: false },
  "facebook.com":            { source: "Facebook",    channel: "Organic Social", paid: false },
  "l.facebook.com":          { source: "Facebook",    channel: "Organic Social", paid: false },
  "lm.facebook.com":         { source: "Facebook",    channel: "Organic Social", paid: false },
  "m.facebook.com":          { source: "Facebook",    channel: "Organic Social", paid: false },

  // ── YouTube (Organic Social) ─────────────────────────────────────────────
  "youtube.com":             { source: "YouTube",     channel: "Organic Social", paid: false },
  "m.youtube.com":           { source: "YouTube",     channel: "Organic Social", paid: false },
  "youtu.be":                { source: "YouTube",     channel: "Organic Social", paid: false },

  // ── LinkedIn ─────────────────────────────────────────────────────────────
  "linkedin.com":            { source: "LinkedIn",    channel: "Organic Social", paid: false },
  "lnkd.in":                 { source: "LinkedIn",    channel: "Organic Social", paid: false },

  // ── X/Twitter ────────────────────────────────────────────────────────────
  "t.co":                    { source: "X (Twitter)", channel: "Organic Social", paid: false },
  "x.com":                   { source: "X (Twitter)", channel: "Organic Social", paid: false },
  "twitter.com":             { source: "X (Twitter)", channel: "Organic Social", paid: false },

  // ── TikTok ───────────────────────────────────────────────────────────────
  "tiktok.com":              { source: "TikTok",      channel: "Organic Social", paid: false },
  "www.tiktok.com":          { source: "TikTok",      channel: "Organic Social", paid: false },

  // ── Pinterest ────────────────────────────────────────────────────────────
  "pinterest.com":           { source: "Pinterest",   channel: "Organic Social", paid: false },
  "br.pinterest.com":        { source: "Pinterest",   channel: "Organic Social", paid: false },
  "pin.it":                  { source: "Pinterest",   channel: "Organic Social", paid: false },

  // ── Reddit ───────────────────────────────────────────────────────────────
  "reddit.com":              { source: "Reddit Ads",  channel: "Paid Social",    paid: false },
  // Nota: Reddit orgânico cai aqui mesmo (paid=false), mas usa source "Reddit Ads"
  // porque é a fonte canônica que temos. Admin pode renomear.

  // ── Mensagem ─────────────────────────────────────────────────────────────
  "wa.me":                   { source: "WhatsApp",    channel: "Organic Social", paid: false },
  "web.whatsapp.com":        { source: "WhatsApp",    channel: "Organic Social", paid: false },
  "api.whatsapp.com":        { source: "WhatsApp",    channel: "Organic Social", paid: false },

  // ── AI Assistants ────────────────────────────────────────────────────────
  // Categoria de tráfego que mais cresce em 2024-2026.
  // Cada plataforma é um source separado pra análise granular.
  "chatgpt.com":             { source: "ChatGPT",     channel: "AI Assistant",   paid: false },
  "chat.openai.com":         { source: "ChatGPT",     channel: "AI Assistant",   paid: false },
  "perplexity.ai":           { source: "Perplexity",  channel: "AI Assistant",   paid: false },
  "www.perplexity.ai":       { source: "Perplexity",  channel: "AI Assistant",   paid: false },
  "claude.ai":               { source: "Claude",      channel: "AI Assistant",   paid: false },
  "gemini.google.com":       { source: "Gemini",      channel: "AI Assistant",   paid: false },
  "bard.google.com":         { source: "Gemini",      channel: "AI Assistant",   paid: false },
  "copilot.microsoft.com":   { source: "Copilot",     channel: "AI Assistant",   paid: false },
  "meta.ai":                 { source: "Meta AI",     channel: "AI Assistant",   paid: false },
  "you.com":                 { source: "You.com",     channel: "AI Assistant",   paid: false },
  "phind.com":               { source: "Phind",       channel: "AI Assistant",   paid: false },
  "kagi.com":                { source: "Kagi",        channel: "AI Assistant",   paid: false },
  "poe.com":                 { source: "Poe",         channel: "AI Assistant",   paid: false },
  "grok.com":                { source: "Grok",        channel: "AI Assistant",   paid: false },
  "x.ai":                    { source: "Grok",        channel: "AI Assistant",   paid: false },
  "search.brave.com":        { source: "Brave Search", channel: "AI Assistant",  paid: false },
};

/**
 * Path-aware checks: hostnames que precisam olhar o path pra classificar.
 * Ex: bing.com vs bing.com/chat (Copilot).
 */
const PATH_AWARE: Array<{ test: (url: URL) => boolean; match: ReferrerMatch }> = [
  // Bing Chat = Copilot
  {
    test: (u) => u.hostname.replace(/^www\./, "") === "bing.com" && u.pathname.startsWith("/chat"),
    match: { source: "Copilot", channel: "AI Assistant", paid: false },
  },
  // Google Search com a barra de chat AI Overview (ainda passa como google.com,
  // não dá pra distinguir só pelo hostname — mantém como Google orgânico)
];

/**
 * Parser de referrer.
 *
 * Casos especiais:
 *   - Referrer interno (mesmo host) → null (caller decide o que fazer; geralmente
 *     significa que ja foi capturado em sessão anterior)
 *   - Domínio desconhecido → retorna match com source = raw hostname,
 *     channel = "Referral", paid = false (caller pode jogar pra quarantine)
 *   - String vazia/inválida → null (caller geralmente trata como "Direct")
 */
export function parseReferrer(
  referrer: string | null | undefined,
  currentHostname?: string | null,
): ReferrerMatch | null {
  if (!referrer || !referrer.trim()) return null;

  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }

  const hostname = url.hostname.replace(/^www\./, "");

  // Referrer interno = navegação interna do próprio site, ignorar
  const current = currentHostname?.replace(/^www\./, "") ?? "";
  if (current && (hostname === current || hostname.endsWith(`.${current}`))) {
    return null;
  }

  // Path-aware checks primeiro (mais específicos)
  for (const rule of PATH_AWARE) {
    if (rule.test(url)) return rule.match;
  }

  // Map direto
  if (REFERRER_MAP[hostname]) {
    return REFERRER_MAP[hostname];
  }

  // Fallback: domínio desconhecido vira Referral genérico
  return {
    source: hostname,
    channel: "Referral",
    paid: false,
  };
}

/**
 * Versão simples — só retorna o source ou "Direct".
 * Usada quando a UI precisa de string única (ex: cookie de tracking).
 */
export function parseReferrerSimple(
  referrer: string | null | undefined,
  currentHostname?: string | null,
): string {
  const match = parseReferrer(referrer, currentHostname);
  if (!match) return "Direct";
  return match.source;
}

/** Set de hostnames AI conhecidos (pra hint em outras lógicas). */
export const AI_HOSTNAMES = new Set<string>([
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "www.perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "bard.google.com",
  "copilot.microsoft.com",
  "meta.ai",
  "you.com",
  "phind.com",
  "kagi.com",
  "poe.com",
  "grok.com",
  "x.ai",
  "search.brave.com",
]);

export function isAiReferrer(hostname: string): boolean {
  const h = hostname.replace(/^www\./, "");
  return AI_HOSTNAMES.has(h);
}
