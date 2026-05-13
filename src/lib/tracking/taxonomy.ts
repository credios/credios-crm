// ============================================================================
// Taxonomia canônica de tracking — Channel × Source
// ============================================================================
// Channels são estáveis (alinhados com GA4 default channel grouping).
// Sources são extensíveis via tabela `tracking_sources` (admin gerencia pela UI).
//
// Esta constantes são o "core canônico" — espelho exato do que vai no seed
// inicial da tabela tracking_sources. Quando admin adiciona um novo source
// pela UI, ele entra no DB mas não precisa estar aqui.
//
// Por que duplicar entre constants e DB:
//   - constants/seed garante consistência inicial e migrations idempotentes
//   - tabela DB é a fonte da verdade em runtime (admin pode editar)
//   - código que importa esses constants serve pra seed, fallback classifier,
//     e validação de tipos quando o source vem de cliente externo
// ============================================================================

export const CHANNELS = [
  "Paid Search",        // Google Ads (search), Microsoft Ads
  "Paid Social",        // Meta Ads, TikTok Ads, LinkedIn Ads, Reddit Ads, etc
  "Paid Video",         // YouTube Ads, TikTok Spark Ads
  "Paid Display",       // Google Display Network, programmatic
  "Organic Search",     // Google, Bing orgânico
  "Organic Social",     // Instagram, Facebook, TikTok, LinkedIn orgânico
  "AI Assistant",       // ChatGPT, Perplexity, Claude, Gemini, Copilot...
  "Direct",             // sem referrer / digitou URL
  "Referral",           // outros sites
  "Indicação",          // referral interno (cliente indica)
  "Email",              // newsletters, transacional
  "Manual",             // criado por consultor no CRM
] as const;

export type Channel = (typeof CHANNELS)[number];

/**
 * Sources canônicos com seu channel correspondente + flag `paid`.
 *
 * Ordem importa pra UI de filtros (ordem em que aparecem no dropdown).
 * Cor é hex (sem #) usada em badges. Icon é nome do Lucide icon.
 *
 * IMPORTANTE: quando adicionar nova fonte:
 *   1. Adicionar aqui
 *   2. Adicionar no seed da migration ou via /configuracoes/tracking
 *   3. Adicionar patterns de detecção em referrer.ts/click-id-chain.ts se aplicável
 */
export type CanonicalSource = {
  source: string;
  channel: Channel;
  paid: boolean;
  /** Hex (sem #) — usado em badges/charts */
  color: string;
  /** Lucide icon name */
  icon: string;
  /** Ordem em UIs de listagem/filtro */
  ordem: number;
};

export const CANONICAL_SOURCES: CanonicalSource[] = [
  // ── Paid Search ──────────────────────────────────────────────────────────
  { source: "Google Ads",       channel: "Paid Search",    paid: true,  color: "4285F4", icon: "Search",        ordem: 10 },
  { source: "Microsoft Ads",    channel: "Paid Search",    paid: true,  color: "00A4EF", icon: "Search",        ordem: 11 },

  // ── Paid Social ──────────────────────────────────────────────────────────
  { source: "Meta Ads",         channel: "Paid Social",    paid: true,  color: "1877F2", icon: "Facebook",      ordem: 20 },
  { source: "TikTok Ads",       channel: "Paid Social",    paid: true,  color: "010101", icon: "Music",         ordem: 21 },
  { source: "LinkedIn Ads",     channel: "Paid Social",    paid: true,  color: "0A66C2", icon: "Linkedin",      ordem: 22 },
  { source: "Reddit Ads",       channel: "Paid Social",    paid: true,  color: "FF4500", icon: "MessageCircle", ordem: 23 },
  { source: "Pinterest Ads",    channel: "Paid Social",    paid: true,  color: "E60023", icon: "Image",         ordem: 24 },
  { source: "Snapchat Ads",     channel: "Paid Social",    paid: true,  color: "FFFC00", icon: "Camera",        ordem: 25 },
  { source: "X Ads",            channel: "Paid Social",    paid: true,  color: "000000", icon: "Twitter",       ordem: 26 },

  // ── Paid Video ───────────────────────────────────────────────────────────
  { source: "YouTube Ads",      channel: "Paid Video",     paid: true,  color: "FF0000", icon: "Youtube",       ordem: 30 },

  // ── Paid Display ─────────────────────────────────────────────────────────
  { source: "Google Display",   channel: "Paid Display",   paid: true,  color: "34A853", icon: "Tv",            ordem: 40 },

  // ── Organic Search ───────────────────────────────────────────────────────
  { source: "Google",           channel: "Organic Search", paid: false, color: "4285F4", icon: "Search",        ordem: 50 },
  { source: "Bing",             channel: "Organic Search", paid: false, color: "00A4EF", icon: "Search",        ordem: 51 },
  { source: "DuckDuckGo",       channel: "Organic Search", paid: false, color: "DE5833", icon: "Search",        ordem: 52 },
  { source: "Yahoo",            channel: "Organic Search", paid: false, color: "6001D2", icon: "Search",        ordem: 53 },

  // ── Organic Social ───────────────────────────────────────────────────────
  { source: "Instagram",        channel: "Organic Social", paid: false, color: "E4405F", icon: "Instagram",     ordem: 60 },
  { source: "Facebook",         channel: "Organic Social", paid: false, color: "1877F2", icon: "Facebook",      ordem: 61 },
  { source: "TikTok",           channel: "Organic Social", paid: false, color: "010101", icon: "Music",         ordem: 62 },
  { source: "LinkedIn",         channel: "Organic Social", paid: false, color: "0A66C2", icon: "Linkedin",      ordem: 63 },
  { source: "YouTube",          channel: "Organic Social", paid: false, color: "FF0000", icon: "Youtube",       ordem: 64 },
  { source: "X (Twitter)",      channel: "Organic Social", paid: false, color: "000000", icon: "Twitter",       ordem: 65 },
  { source: "WhatsApp",         channel: "Organic Social", paid: false, color: "25D366", icon: "MessageCircle", ordem: 66 },
  { source: "Pinterest",        channel: "Organic Social", paid: false, color: "E60023", icon: "Image",         ordem: 67 },

  // ── AI Assistant ─────────────────────────────────────────────────────────
  // Tráfego de assistentes de IA generativa — segmento que mais cresce em 2024-2026
  // pra B2C high-ticket. Cada plataforma vira source separado pra permitir
  // análise granular de qual AI converte melhor.
  { source: "ChatGPT",          channel: "AI Assistant",   paid: false, color: "10A37F", icon: "Bot",           ordem: 70 },
  { source: "Perplexity",       channel: "AI Assistant",   paid: false, color: "20808D", icon: "Bot",           ordem: 71 },
  { source: "Claude",           channel: "AI Assistant",   paid: false, color: "CC9B7A", icon: "Bot",           ordem: 72 },
  { source: "Gemini",           channel: "AI Assistant",   paid: false, color: "8E75B2", icon: "Bot",           ordem: 73 },
  { source: "Copilot",          channel: "AI Assistant",   paid: false, color: "0078D4", icon: "Bot",           ordem: 74 },
  { source: "Meta AI",          channel: "AI Assistant",   paid: false, color: "0866FF", icon: "Bot",           ordem: 75 },
  { source: "You.com",          channel: "AI Assistant",   paid: false, color: "7C3AED", icon: "Bot",           ordem: 76 },
  { source: "Phind",            channel: "AI Assistant",   paid: false, color: "00FFAA", icon: "Bot",           ordem: 77 },
  { source: "Kagi",             channel: "AI Assistant",   paid: false, color: "FFB319", icon: "Bot",           ordem: 78 },
  { source: "Poe",              channel: "AI Assistant",   paid: false, color: "5436DA", icon: "Bot",           ordem: 79 },
  { source: "Grok",             channel: "AI Assistant",   paid: false, color: "1DA1F2", icon: "Bot",           ordem: 80 },
  { source: "Brave Search",     channel: "AI Assistant",   paid: false, color: "FB542B", icon: "Bot",           ordem: 81 },

  // ── Direct / Manual / Outros ─────────────────────────────────────────────
  { source: "Direct",           channel: "Direct",         paid: false, color: "6B7280", icon: "Globe",         ordem: 90 },
  { source: "Indicação",        channel: "Indicação",      paid: false, color: "F59E0B", icon: "UserCheck",     ordem: 91 },
  { source: "Manual",           channel: "Manual",         paid: false, color: "8B5CF6", icon: "UserPlus",      ordem: 92 },
  { source: "Email",            channel: "Email",          paid: false, color: "06B6D4", icon: "Mail",          ordem: 93 },
  { source: "Condomínio",       channel: "Referral",       paid: false, color: "059669", icon: "Building",      ordem: 94 },
  { source: "Unknown",          channel: "Direct",         paid: false, color: "9CA3AF", icon: "HelpCircle",    ordem: 999 },
];

/** Map source → channel (lookup rápido). */
export const SOURCE_TO_CHANNEL: Record<string, Channel> = Object.fromEntries(
  CANONICAL_SOURCES.map((s) => [s.source, s.channel]),
);

/** Map source → paid (lookup rápido). */
export const SOURCE_TO_PAID: Record<string, boolean> = Object.fromEntries(
  CANONICAL_SOURCES.map((s) => [s.source, s.paid]),
);

/** Set de sources canônicos (validação em runtime). */
export const CANONICAL_SOURCE_SET = new Set(CANONICAL_SOURCES.map((s) => s.source));

export function isCanonicalSource(s: string): boolean {
  return CANONICAL_SOURCE_SET.has(s);
}

export function isChannel(s: string): s is Channel {
  return (CHANNELS as readonly string[]).includes(s);
}

/**
 * Aliases de `utm_source` (lowercase) → source canônico.
 *
 * Cobre variações comuns:
 *   - Capitalização ("google", "Google", "GOOGLE" → todas viram "Google")
 *   - Nomes diferentes ("fb" → "Facebook")
 *   - Plataformas que usam utm_source em vez de click ID
 *
 * Quando aparece utm_source desconhecido, vai pra quarantine
 * (tracking_unknowns) pra admin classificar.
 */
export const UTM_SOURCE_ALIASES: Record<string, string> = {
  // Google (incluindo variante hostname)
  "google":        "Google",
  "google.com":    "Google",
  "google.com.br": "Google",
  "www.google.com": "Google",
  "google-search": "Google",
  "googleads":     "Google Ads",
  "google_ads":    "Google Ads",
  "google-ads":    "Google Ads",
  "adwords":       "Google Ads",
  "googleadwords": "Google Ads",

  // Microsoft
  "bing":          "Bing",
  "bing.com":      "Bing",
  "microsoft":     "Microsoft Ads",
  "microsoftads":  "Microsoft Ads",
  "msn":           "Bing",

  // Meta (incluindo variantes hostname)
  "facebook":      "Facebook",
  "facebook.com":  "Facebook",
  "fb":            "Facebook",
  "fb.com":        "Facebook",
  "meta":          "Facebook",
  "instagram":     "Instagram",
  "instagram.com": "Instagram",
  "ig":            "Instagram",
  "metaads":       "Meta Ads",
  "meta-ads":      "Meta Ads",
  "fbads":         "Meta Ads",
  "facebook-ads":  "Meta Ads",

  // TikTok
  "tiktok":        "TikTok",
  "tiktok.com":    "TikTok",
  "tk":            "TikTok",
  "tiktokads":     "TikTok Ads",
  "tiktok-ads":    "TikTok Ads",

  // LinkedIn
  "linkedin":      "LinkedIn",
  "linkedin.com":  "LinkedIn",
  "li":            "LinkedIn",
  "linkedinads":   "LinkedIn Ads",

  // YouTube
  "youtube":       "YouTube",
  "youtube.com":   "YouTube",
  "youtu.be":      "YouTube",
  "yt":            "YouTube",
  "youtubeads":    "YouTube Ads",

  // Outras redes (incluindo variantes hostname)
  "twitter":       "X (Twitter)",
  "twitter.com":   "X (Twitter)",
  "x":             "X (Twitter)",
  "x.com":         "X (Twitter)",
  "reddit":        "Reddit Ads",  // Reddit costuma ser pago quando usa utm
  "reddit.com":    "Reddit Ads",
  "pinterest":     "Pinterest",
  "pinterest.com": "Pinterest",
  "snapchat":      "Snapchat Ads",
  "snapchat.com":  "Snapchat Ads",
  "whatsapp":      "WhatsApp",
  "whatsapp.com":  "WhatsApp",
  "wa":            "WhatsApp",
  "wa.me":         "WhatsApp",

  // AI Assistants
  // Inclui variantes "name" e "hostname" porque o ChatGPT (e similares)
  // injetam `?utm_source=chatgpt.com` (hostname com TLD) em links — sem
  // os aliases-com-domínio, leads sem referrer HTTP caíam em "Unknown".
  "chatgpt":             "ChatGPT",
  "chatgpt.com":         "ChatGPT",
  "chat.openai.com":     "ChatGPT",
  "openai":              "ChatGPT",
  "openai.com":          "ChatGPT",
  "perplexity":          "Perplexity",
  "perplexity.ai":       "Perplexity",
  "www.perplexity.ai":   "Perplexity",
  "claude":              "Claude",
  "claude.ai":           "Claude",
  "anthropic":           "Claude",
  "anthropic.com":       "Claude",
  "gemini":              "Gemini",
  "gemini.google.com":   "Gemini",
  "bard":                "Gemini",
  "bard.google.com":     "Gemini",
  "copilot":             "Copilot",
  "copilot.microsoft.com": "Copilot",
  "meta-ai":             "Meta AI",
  "metaai":              "Meta AI",
  "meta.ai":             "Meta AI",
  "you":                 "You.com",
  "you.com":             "You.com",
  "phind":               "Phind",
  "phind.com":           "Phind",
  "kagi":                "Kagi",
  "kagi.com":            "Kagi",
  "poe":                 "Poe",
  "poe.com":             "Poe",
  "grok":                "Grok",
  "grok.com":            "Grok",
  "x.ai":                "Grok",
  "brave-search":        "Brave Search",
  "search.brave.com":    "Brave Search",

  // Email / Newsletter
  "newsletter":    "Email",
  "email":         "Email",
  "mailchimp":     "Email",
  "resend":        "Email",

  // Indicação
  "indicacao":     "Indicação",
  "indicação":     "Indicação",
  "referral":      "Indicação",

  // Manual / Direto
  "direct":        "Direct",
  "manual":        "Manual",
  "condominio":    "Condomínio",
  "condomínio":    "Condomínio",
};
