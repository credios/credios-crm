// ============================================================================
// classifyTouch — função canônica de classificação de origem
// ============================================================================
// Roda em 2 lugares idênticos:
//   1. Site (`credios-website-v2`) — decide channel/source no client antes
//      de enviar o lead pro webhook do CRM.
//   2. CRM (este projeto) — re-classifica server-side como fallback. Cobre:
//      - leads que vêm de fontes externas (webhook genérico, não só o site)
//      - leads onde o site não mandou channel/source (versão antiga em cache)
//      - reclassificação retroativa via raw_payload
//
// Quando o client manda channel/source, server confia (depois de validar
// que existem em tracking_sources). Quando NÃO manda ou são inválidos,
// re-classifica do zero baseado em utm/click_id/referrer/etc.
// ============================================================================

import { matchClickId, type ClickIds } from "./click-id-chain";
import { parseReferrer } from "./referrer";
import {
  CANONICAL_SOURCE_SET,
  SOURCE_TO_CHANNEL,
  SOURCE_TO_PAID,
  UTM_SOURCE_ALIASES,
  type Channel,
} from "./taxonomy";

export type ClassifyInput = ClickIds & {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  /** Google Ads {network} token (g/s/d/u) */
  network?: string | null;
  /** Referrer URL completa */
  referrer?: string | null;
  /** Referrer já parseado (caso o site já tenha rodado) — usado como hint */
  referrer_parsed?: string | null;
  /** Hostname do site atual (pra detectar self-referrals) */
  current_hostname?: string | null;
};

export type ClassifyResult = {
  source: string;
  channel: Channel;
  paid: boolean;
  /** Como a classificação foi feita — útil pra debug/auditoria */
  reason:
    | "click_id"
    | "utm_alias"
    | "utm_raw"
    | "referrer"
    | "direct"
    | "unknown";
  /** Click ID que casou (quando aplicável) */
  matched_id?: string;
};

/**
 * Classifica um toque (touch) baseado em sinais de tracking.
 *
 * Hierarquia (do mais confiável pro menos):
 *   1. Click ID (gclid, fbclid, ttclid, etc) — atribuído pela plataforma
 *   2. utm_source mapeado pra alias canônico
 *   3. utm_source raw (capitalizado) — vai como referrer/unknown
 *   4. Referrer parsed (Instagram, ChatGPT, etc)
 *   5. Direct (sem nenhum sinal)
 *
 * NUNCA retorna source vazio — sempre tem um valor. "Unknown" é reservado
 * pra utm_source raw desconhecido que vai pra quarantine.
 */
export function classifyTouch(input: ClassifyInput): ClassifyResult {
  // ── 1. Click ID priority chain ──────────────────────────────────────────
  const clickMatch = matchClickId(input, {
    network: input.network,
    utm_medium: input.utm_medium,
    referrer_parsed: input.referrer_parsed,
  });
  if (clickMatch) {
    return {
      source: clickMatch.source,
      channel: clickMatch.channel,
      paid: clickMatch.paid,
      reason: "click_id",
      matched_id: clickMatch.matched_id,
    };
  }

  // ── 2. UTM source alias ─────────────────────────────────────────────────
  const utm = input.utm_source?.trim().toLowerCase();
  if (utm) {
    const canonical = UTM_SOURCE_ALIASES[utm];
    if (canonical && CANONICAL_SOURCE_SET.has(canonical)) {
      return {
        source: canonical,
        channel: SOURCE_TO_CHANNEL[canonical]!,
        paid: SOURCE_TO_PAID[canonical] ?? isPaidByMedium(input.utm_medium),
        reason: "utm_alias",
      };
    }
  }

  // ── 3. Referrer parsed ──────────────────────────────────────────────────
  const refMatch = parseReferrer(input.referrer, input.current_hostname);
  if (refMatch) {
    // Se o source já é canônico, usa direto
    if (CANONICAL_SOURCE_SET.has(refMatch.source)) {
      return {
        source: refMatch.source,
        channel: refMatch.channel,
        paid: refMatch.paid,
        reason: "referrer",
      };
    }
    // Referrer com hostname desconhecido — vira "Unknown" pra quarantine
    return {
      source: "Unknown",
      channel: "Referral",
      paid: false,
      reason: "unknown",
    };
  }

  // ── 4. UTM raw (desconhecido) ───────────────────────────────────────────
  // Se chegou aqui e tem utm_source mas nem alias nem referrer ajudaram,
  // ainda assim é um sinal. Manda pra quarantine como Unknown.
  if (utm) {
    return {
      source: "Unknown",
      channel: "Direct",
      paid: isPaidByMedium(input.utm_medium),
      reason: "utm_raw",
    };
  }

  // ── 5. Direct ───────────────────────────────────────────────────────────
  return {
    source: "Direct",
    channel: "Direct",
    paid: false,
    reason: "direct",
  };
}

function isPaidByMedium(medium: string | null | undefined): boolean {
  if (!medium) return false;
  const m = medium.toLowerCase();
  return (
    m.includes("paid") ||
    m.includes("cpc") ||
    m.includes("cpm") ||
    m === "ad" ||
    m === "ads"
  );
}

/**
 * Validador: confirma que channel/source vindos do client (via webhook) são
 * coerentes com a taxonomia. Se source não é canônico ou channel não bate
 * com o esperado, força reclassificação.
 *
 * Retorna a versão validada/corrigida.
 */
export function validateClientClassification(
  source: string | null | undefined,
  channel: string | null | undefined,
  paid: boolean | null | undefined,
  fallbackInput: ClassifyInput,
): ClassifyResult & { from_client: boolean } {
  // Se o client mandou um source que está na taxonomia canônica, confia
  // mas re-deriva channel/paid (proteção contra mismatches).
  if (source && CANONICAL_SOURCE_SET.has(source)) {
    const expectedChannel = SOURCE_TO_CHANNEL[source]!;
    return {
      source,
      channel: expectedChannel,
      paid: SOURCE_TO_PAID[source] ?? Boolean(paid),
      reason: "click_id", // assume foi click_id porque o client classificou
      from_client: true,
    };
  }

  // Fallback: reclassifica do zero
  const reclassified = classifyTouch(fallbackInput);
  return { ...reclassified, from_client: false };
}
