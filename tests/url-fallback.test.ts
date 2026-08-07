import { describe, expect, it } from "vitest";

import { classifyTouch } from "@/lib/tracking/classify";
import { extractTrackingFromUrl, withUrlFallback } from "@/lib/tracking/url-fallback";

// Espelho do teste homônimo no credios-website-v2 (libs de tracking irmãs).
// Casos reais da auditoria de 07/08/2026: navegadores sem cookies enviaram
// todos os sinais vazios, mas a pagina_entrada carregava a tag da origem.
const URL_ANDRESSA = "https://www.credios.com.br/?utm_source=chatgpt.com";
const URL_ODILEIA =
  "https://www.credios.com.br/simulador?utm_source=youtube&utm_medium=organic&utm_campaign=canal";

describe("extractTrackingFromUrl", () => {
  it("extrai utm_source de URL completa (caso ChatGPT)", () => {
    expect(extractTrackingFromUrl(URL_ANDRESSA)).toEqual({
      utm_source: "chatgpt.com",
    });
  });

  it("extrai múltiplos UTMs (caso YouTube manual)", () => {
    expect(extractTrackingFromUrl(URL_ODILEIA)).toEqual({
      utm_source: "youtube",
      utm_medium: "organic",
      utm_campaign: "canal",
    });
  });

  it("extrai click IDs e aceita URL relativa", () => {
    expect(extractTrackingFromUrl("/lp?gclid=abc123")).toEqual({ gclid: "abc123" });
  });

  it("retorna {} pra URL ausente, inválida ou sem tracking", () => {
    expect(extractTrackingFromUrl(null)).toEqual({});
    expect(extractTrackingFromUrl("")).toEqual({});
    expect(extractTrackingFromUrl("https://")).toEqual({});
    expect(extractTrackingFromUrl("https://www.credios.com.br/?foo=bar")).toEqual({});
  });
});

describe("withUrlFallback + classifyTouch (regressão: Direct com tag na URL)", () => {
  it("payload vazio + tag ChatGPT na pagina_entrada → ChatGPT", () => {
    const signals = withUrlFallback({ utm_source: null, referrer: null }, URL_ANDRESSA);
    const result = classifyTouch(signals);
    expect(result.source).toBe("ChatGPT");
    expect(result.channel).toBe("AI Assistant");
  });

  it("payload explícito vence a URL", () => {
    const signals = withUrlFallback({ utm_source: "google" }, URL_ANDRESSA);
    expect(signals.utm_source).toBe("google");
  });

  it("sem tag na URL segue Direct", () => {
    const signals = withUrlFallback(
      { utm_source: null, referrer: null },
      "https://www.credios.com.br/simulador",
    );
    expect(classifyTouch(signals).source).toBe("Direct");
  });
});
