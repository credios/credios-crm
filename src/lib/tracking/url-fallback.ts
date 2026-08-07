// ============================================================================
// URL fallback — extração de sinais de tracking da própria URL
// ============================================================================
// Alguns navegadores não persistem cookies (in-app browsers de ChatGPT/
// YouTube/Instagram, modos de privacidade agressivos). Nesses casos TODOS os
// cookies de tracking chegam vazios no submit — mas a URL de entrada
// (current_url no site, pagina_entrada no CRM) ainda carrega o
// `?utm_source=...` original. Auditoria de 07/08/2026: 4 leads em 14 dias
// com a tag visível na URL e origem "Direct" por cookies bloqueados.
//
// Este helper recupera os sinais direto da URL — último degrau da hierarquia
// cookie → memória de sessão → URL. Cookie sempre vence quando existe: ele
// representa o estado capturado (last non-direct de 30 dias); a URL é o
// paraquedas pra quando nada foi persistido.
//
// Espelhado em credios-website-v2 e credios-crm (libs de tracking irmãs).
// ============================================================================

/** Parâmetros de tracking reconhecidos (UTMs + ValueTrack + click IDs). */
export const TRACKING_URL_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_adgroup",
  "utm_term",
  "utm_content",
  "matchtype",
  "device",
  "network",
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "wbraid",
  "gbraid",
  "li_fat_id",
  "twclid",
  "rdt_cid",
  "sccid",
  "pin_aid",
  "epik",
  "irclickid",
  "cjevent",
] as const;

export type TrackingUrlParam = (typeof TRACKING_URL_PARAMS)[number];

export type TrackingSignals = Partial<Record<TrackingUrlParam, string>>;

/**
 * Extrai parâmetros de tracking de uma URL completa ou relativa
 * ("/simulador?utm_source=x" também funciona). Retorna só as chaves
 * presentes com valor não-vazio. URL inválida/ausente → {}.
 */
export function extractTrackingFromUrl(
  url: string | null | undefined,
): TrackingSignals {
  if (!url || !url.trim()) return {};
  let parsed: URL;
  try {
    parsed = new URL(url, "https://www.credios.com.br");
  } catch {
    return {};
  }
  const out: TrackingSignals = {};
  for (const param of TRACKING_URL_PARAMS) {
    const value = parsed.searchParams.get(param)?.trim();
    if (value) out[param] = value;
  }
  return out;
}

/**
 * Completa sinais de tracking vazios com o que a URL carrega.
 * Valores já presentes (cookie/payload) NUNCA são sobrescritos.
 */
export function withUrlFallback<
  T extends Partial<Record<TrackingUrlParam, string | null | undefined>>,
>(data: T, url: string | null | undefined): T {
  const fromUrl = extractTrackingFromUrl(url);
  if (Object.keys(fromUrl).length === 0) return data;
  const merged = { ...data };
  for (const param of TRACKING_URL_PARAMS) {
    const current = merged[param];
    if ((current === undefined || current === null || current === "") && fromUrl[param]) {
      (merged as Record<TrackingUrlParam, string>)[param] = fromUrl[param];
    }
  }
  return merged;
}
