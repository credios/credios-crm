// ============================================================================
// Click ID priority chain
// ============================================================================
// Cada plataforma de Ads injeta um click ID na URL de destino. Esses IDs são
// o sinal mais confiável de origem porque são adicionados pela própria
// plataforma — não dependem de UTM manual nem de referrer (que pode ser
// strippado por in-app browser, HTTPS→HTTP, no-referrer policy, etc).
//
// Hierarquia segue padrão de mercado (Google, Bizible, Northbeam, Triple Whale):
// click ID > UTM > referrer > direto.
// ============================================================================

import type { Channel } from "./taxonomy";

export type ClickIds = {
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  msclkid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  li_fat_id?: string | null;
  twclid?: string | null;
  rdt_cid?: string | null;
  sccid?: string | null;
  pin_aid?: string | null;
  epik?: string | null;
  irclickid?: string | null;
  cjevent?: string | null;
};

export type ClickIdMatch = {
  source: string;
  channel: Channel;
  paid: boolean;
  /** Qual click ID disparou a classificação. Útil pra debug. */
  matched_id: keyof ClickIds;
};

/**
 * Aplica click ID priority chain.
 *
 * Casos especiais:
 *   - gclid + network="u" (YouTube) → "YouTube Ads" (Paid Video)
 *   - gclid + network="d" (Display) → "Google Display" (Paid Display)
 *   - fbclid + medium paid → "Meta Ads" (Paid Social)
 *   - fbclid + referrer Instagram/Facebook → orgânico (caso comum: usuário compartilhou
 *     link de página orgânica e fbclid foi anexado automaticamente pelo Meta browser)
 *
 * Retorna null se nenhum click ID está presente.
 */
export function matchClickId(
  ids: ClickIds,
  hints?: {
    /** Google Ads network: g (search), s (search partners), d (display), u (YouTube) */
    network?: string | null;
    /** utm_medium pra distinguir Meta pago vs orgânico */
    utm_medium?: string | null;
    /** referrer parseado pra distinguir Instagram vs Facebook em fbclid orgânico */
    referrer_parsed?: string | null;
  },
): ClickIdMatch | null {
  // Google Ads (incluindo iOS via wbraid/gbraid)
  if (ids.gclid || ids.wbraid || ids.gbraid) {
    const network = hints?.network?.trim().toLowerCase();
    const matched_id: keyof ClickIds = ids.gclid ? "gclid" : ids.wbraid ? "wbraid" : "gbraid";
    if (network === "u") {
      return { source: "YouTube Ads", channel: "Paid Video", paid: true, matched_id };
    }
    if (network === "d") {
      return { source: "Google Display", channel: "Paid Display", paid: true, matched_id };
    }
    return { source: "Google Ads", channel: "Paid Search", paid: true, matched_id };
  }

  // Microsoft Ads
  if (ids.msclkid) {
    return { source: "Microsoft Ads", channel: "Paid Search", paid: true, matched_id: "msclkid" };
  }

  // TikTok Ads
  if (ids.ttclid) {
    return { source: "TikTok Ads", channel: "Paid Social", paid: true, matched_id: "ttclid" };
  }

  // LinkedIn Ads
  if (ids.li_fat_id) {
    return { source: "LinkedIn Ads", channel: "Paid Social", paid: true, matched_id: "li_fat_id" };
  }

  // X/Twitter Ads
  if (ids.twclid) {
    return { source: "X Ads", channel: "Paid Social", paid: true, matched_id: "twclid" };
  }

  // Reddit Ads
  if (ids.rdt_cid) {
    return { source: "Reddit Ads", channel: "Paid Social", paid: true, matched_id: "rdt_cid" };
  }

  // Snapchat Ads
  if (ids.sccid) {
    return { source: "Snapchat Ads", channel: "Paid Social", paid: true, matched_id: "sccid" };
  }

  // Pinterest Ads (pin_aid ou epik)
  if (ids.pin_aid || ids.epik) {
    return {
      source: "Pinterest Ads",
      channel: "Paid Social",
      paid: true,
      matched_id: ids.pin_aid ? "pin_aid" : "epik",
    };
  }

  // Affiliate networks (Impact, CJ)
  if (ids.irclickid || ids.cjevent) {
    return {
      source: "Indicação",
      channel: "Indicação",
      paid: true,
      matched_id: ids.irclickid ? "irclickid" : "cjevent",
    };
  }

  // Meta (Facebook/Instagram) — distinção paid vs orgânico
  if (ids.fbclid) {
    const med = (hints?.utm_medium ?? "").toLowerCase();
    const isPaidMedium =
      med.includes("paid") ||
      med.includes("cpc") ||
      med.includes("cpm") ||
      med === "ad" ||
      med === "ads" ||
      med === "social-paid";

    if (isPaidMedium) {
      return { source: "Meta Ads", channel: "Paid Social", paid: true, matched_id: "fbclid" };
    }

    // Sem medium pago: o fbclid pode vir tanto de anúncio quanto de
    // compartilhamento orgânico (Meta injeta fbclid em todo link saindo
    // do app, mesmo orgânico). Usa referrer pra distinguir.
    const ref = (hints?.referrer_parsed ?? "").toLowerCase();
    if (ref.includes("instagram")) {
      return { source: "Instagram", channel: "Organic Social", paid: false, matched_id: "fbclid" };
    }
    if (ref.includes("facebook")) {
      return { source: "Facebook", channel: "Organic Social", paid: false, matched_id: "fbclid" };
    }

    // fbclid sem referrer e sem medium pago: assume Meta Ads (caso comum:
    // in-app browser strippou referrer mas o lead veio de anúncio).
    return { source: "Meta Ads", channel: "Paid Social", paid: true, matched_id: "fbclid" };
  }

  return null;
}

/** Lista de todos os click IDs como tuplas pra iteração. */
export const ALL_CLICK_IDS: readonly (keyof ClickIds)[] = [
  "gclid",
  "wbraid",
  "gbraid",
  "msclkid",
  "fbclid",
  "ttclid",
  "li_fat_id",
  "twclid",
  "rdt_cid",
  "sccid",
  "pin_aid",
  "epik",
  "irclickid",
  "cjevent",
];
