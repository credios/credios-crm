import { describe, expect, it } from "vitest";

import { matchClickId } from "@/lib/tracking/click-id-chain";
import { classifyTouch } from "@/lib/tracking/classify";
import { parseReferrer } from "@/lib/tracking/referrer";
import {
  CANONICAL_SOURCES,
  SOURCE_TO_CHANNEL,
  UTM_SOURCE_ALIASES,
} from "@/lib/tracking/taxonomy";

// ============================================================================
// Click ID priority chain
// ============================================================================
describe("matchClickId", () => {
  it("gclid → Google Ads", () => {
    const r = matchClickId({ gclid: "Cj0KCQ..." });
    expect(r?.source).toBe("Google Ads");
    expect(r?.channel).toBe("Paid Search");
    expect(r?.paid).toBe(true);
  });

  it("gclid + network=u → YouTube Ads (Paid Video)", () => {
    const r = matchClickId({ gclid: "Cj0KCQ..." }, { network: "u" });
    expect(r?.source).toBe("YouTube Ads");
    expect(r?.channel).toBe("Paid Video");
  });

  it("gclid + network=d → Google Display (Paid Display)", () => {
    const r = matchClickId({ gclid: "abc" }, { network: "d" });
    expect(r?.source).toBe("Google Display");
    expect(r?.channel).toBe("Paid Display");
  });

  it("wbraid (iOS ATT) → Google Ads", () => {
    const r = matchClickId({ wbraid: "xyz" });
    expect(r?.source).toBe("Google Ads");
    expect(r?.matched_id).toBe("wbraid");
  });

  it("msclkid → Microsoft Ads", () => {
    const r = matchClickId({ msclkid: "abc" });
    expect(r?.source).toBe("Microsoft Ads");
    expect(r?.channel).toBe("Paid Search");
  });

  it("ttclid → TikTok Ads (Paid Social)", () => {
    const r = matchClickId({ ttclid: "abc" });
    expect(r?.source).toBe("TikTok Ads");
    expect(r?.channel).toBe("Paid Social");
  });

  it("li_fat_id → LinkedIn Ads (Paid Social)", () => {
    const r = matchClickId({ li_fat_id: "abc" });
    expect(r?.source).toBe("LinkedIn Ads");
    expect(r?.channel).toBe("Paid Social");
  });

  it("twclid → X Ads", () => {
    const r = matchClickId({ twclid: "abc" });
    expect(r?.source).toBe("X Ads");
  });

  it("rdt_cid → Reddit Ads", () => {
    const r = matchClickId({ rdt_cid: "abc" });
    expect(r?.source).toBe("Reddit Ads");
  });

  it("pin_aid → Pinterest Ads", () => {
    const r = matchClickId({ pin_aid: "abc" });
    expect(r?.source).toBe("Pinterest Ads");
  });

  it("fbclid + paid medium → Meta Ads", () => {
    const r = matchClickId(
      { fbclid: "abc" },
      { utm_medium: "paid_social" },
    );
    expect(r?.source).toBe("Meta Ads");
    expect(r?.paid).toBe(true);
  });

  it("fbclid + referrer Instagram → Instagram (orgânico)", () => {
    const r = matchClickId(
      { fbclid: "abc" },
      { referrer_parsed: "Instagram" },
    );
    expect(r?.source).toBe("Instagram");
    expect(r?.channel).toBe("Organic Social");
    expect(r?.paid).toBe(false);
  });

  it("fbclid sem hints → Meta Ads (assume paid)", () => {
    const r = matchClickId({ fbclid: "abc" });
    expect(r?.source).toBe("Meta Ads");
  });

  it("sem nenhum click ID → null", () => {
    expect(matchClickId({})).toBeNull();
  });

  it("prioridade: gclid antes de fbclid", () => {
    const r = matchClickId({ gclid: "g", fbclid: "f" });
    expect(r?.source).toBe("Google Ads");
  });
});

// ============================================================================
// parseReferrer
// ============================================================================
describe("parseReferrer", () => {
  it("retorna null pra referrer vazio", () => {
    expect(parseReferrer(null)).toBeNull();
    expect(parseReferrer("")).toBeNull();
  });

  it("Google → Organic Search", () => {
    const r = parseReferrer("https://www.google.com/search?q=credios");
    expect(r?.source).toBe("Google");
    expect(r?.channel).toBe("Organic Search");
  });

  it("Instagram → Organic Social", () => {
    const r = parseReferrer("https://l.instagram.com/?u=...");
    expect(r?.source).toBe("Instagram");
    expect(r?.channel).toBe("Organic Social");
  });

  it("ChatGPT → AI Assistant", () => {
    const r = parseReferrer("https://chatgpt.com/c/abc");
    expect(r?.source).toBe("ChatGPT");
    expect(r?.channel).toBe("AI Assistant");
  });

  it("Perplexity → AI Assistant", () => {
    const r = parseReferrer("https://www.perplexity.ai/search/...");
    expect(r?.source).toBe("Perplexity");
    expect(r?.channel).toBe("AI Assistant");
  });

  it("Claude → AI Assistant", () => {
    const r = parseReferrer("https://claude.ai/chat/abc");
    expect(r?.source).toBe("Claude");
    expect(r?.channel).toBe("AI Assistant");
  });

  it("Gemini → AI Assistant", () => {
    const r = parseReferrer("https://gemini.google.com/app");
    expect(r?.source).toBe("Gemini");
    expect(r?.channel).toBe("AI Assistant");
  });

  it("bing.com/chat → Copilot (path-aware)", () => {
    const r = parseReferrer("https://www.bing.com/chat?q=credios");
    expect(r?.source).toBe("Copilot");
    expect(r?.channel).toBe("AI Assistant");
  });

  it("bing.com normal → Bing (Organic Search)", () => {
    const r = parseReferrer("https://www.bing.com/search?q=credios");
    expect(r?.source).toBe("Bing");
    expect(r?.channel).toBe("Organic Search");
  });

  it("self-referral → null (interno)", () => {
    const r = parseReferrer(
      "https://credios.com.br/simulador",
      "credios.com.br",
    );
    expect(r).toBeNull();
  });

  it("self-referral www → null (interno)", () => {
    const r = parseReferrer(
      "https://www.credios.com.br/simulador",
      "credios.com.br",
    );
    expect(r).toBeNull();
  });

  it("domínio desconhecido → Referral genérico", () => {
    const r = parseReferrer("https://random-blog.com/post");
    expect(r?.source).toBe("random-blog.com");
    expect(r?.channel).toBe("Referral");
  });

  it("YouTube → Organic Social", () => {
    const r = parseReferrer("https://www.youtube.com/watch?v=abc");
    expect(r?.source).toBe("YouTube");
    expect(r?.channel).toBe("Organic Social");
  });
});

// ============================================================================
// classifyTouch (integração)
// ============================================================================
describe("classifyTouch", () => {
  it("gclid → Google Ads (Paid Search)", () => {
    const r = classifyTouch({ gclid: "abc" });
    expect(r.source).toBe("Google Ads");
    expect(r.channel).toBe("Paid Search");
    expect(r.paid).toBe(true);
    expect(r.reason).toBe("click_id");
  });

  it("apenas utm_source=google → Google (orgânico)", () => {
    const r = classifyTouch({ utm_source: "google" });
    expect(r.source).toBe("Google");
    expect(r.channel).toBe("Organic Search");
    expect(r.reason).toBe("utm_alias");
  });

  it("utm_source=facebook → Facebook (orgânico)", () => {
    const r = classifyTouch({ utm_source: "facebook" });
    expect(r.source).toBe("Facebook");
    expect(r.channel).toBe("Organic Social");
  });

  it("utm_source raw caps insensitive → normaliza", () => {
    const r = classifyTouch({ utm_source: "GOOGLE_ADS" });
    expect(r.source).toBe("Google Ads");
  });

  it("referrer ChatGPT sem UTM → AI Assistant", () => {
    const r = classifyTouch({
      referrer: "https://chatgpt.com/c/abc",
    });
    expect(r.source).toBe("ChatGPT");
    expect(r.channel).toBe("AI Assistant");
    expect(r.reason).toBe("referrer");
  });

  it("nada → Direct", () => {
    const r = classifyTouch({});
    expect(r.source).toBe("Direct");
    expect(r.channel).toBe("Direct");
    expect(r.reason).toBe("direct");
  });

  it("utm_source desconhecido sem alias nem referrer → Unknown (Direct channel)", () => {
    const r = classifyTouch({ utm_source: "platform-x-newsletter-123" });
    expect(r.source).toBe("Unknown");
    expect(r.reason).toBe("utm_raw");
  });

  it("ordem: gclid > utm_source", () => {
    const r = classifyTouch({
      gclid: "abc",
      utm_source: "facebook",
    });
    expect(r.source).toBe("Google Ads");
  });

  it("ordem: click_id > referrer", () => {
    const r = classifyTouch({
      ttclid: "abc",
      referrer: "https://chatgpt.com/",
    });
    expect(r.source).toBe("TikTok Ads");
  });

  it("YouTube Ads (gclid + network=u) sobrescreve YouTube orgânico", () => {
    const r = classifyTouch({
      gclid: "abc",
      network: "u",
      referrer: "https://youtube.com/watch?v=abc",
    });
    expect(r.source).toBe("YouTube Ads");
    expect(r.channel).toBe("Paid Video");
  });

  it("fbclid + Instagram referrer → Instagram orgânico (não Meta Ads)", () => {
    const r = classifyTouch({
      fbclid: "abc",
      referrer: "https://l.instagram.com/?u=...",
      referrer_parsed: "Instagram",
    });
    expect(r.source).toBe("Instagram");
    expect(r.paid).toBe(false);
  });
});

// ============================================================================
// Taxonomia
// ============================================================================
describe("taxonomy", () => {
  it("todos sources canônicos têm channel válido", () => {
    for (const s of CANONICAL_SOURCES) {
      expect(SOURCE_TO_CHANNEL[s.source]).toBe(s.channel);
    }
  });

  it("aliases mapeiam pra sources canônicos existentes", () => {
    for (const [, source] of Object.entries(UTM_SOURCE_ALIASES)) {
      expect(SOURCE_TO_CHANNEL[source]).toBeDefined();
    }
  });

  it("não duplica sources", () => {
    const set = new Set(CANONICAL_SOURCES.map((s) => s.source));
    expect(set.size).toBe(CANONICAL_SOURCES.length);
  });

  it("ChatGPT e outras AIs estão em AI Assistant", () => {
    const ais = CANONICAL_SOURCES.filter((s) => s.channel === "AI Assistant");
    const aiNames = ais.map((s) => s.source);
    expect(aiNames).toContain("ChatGPT");
    expect(aiNames).toContain("Perplexity");
    expect(aiNames).toContain("Claude");
    expect(aiNames).toContain("Gemini");
    expect(aiNames).toContain("Copilot");
  });

  it("YouTube orgânico e YouTube Ads são sources distintos", () => {
    const sources = CANONICAL_SOURCES.map((s) => s.source);
    expect(sources).toContain("YouTube");
    expect(sources).toContain("YouTube Ads");
    expect(SOURCE_TO_CHANNEL.YouTube).toBe("Organic Social");
    expect(SOURCE_TO_CHANNEL["YouTube Ads"]).toBe("Paid Video");
  });
});
