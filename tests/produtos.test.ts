import { describe, expect, it } from "vitest";

import { aceitaContatoAutomatizado, ehCgi, normalizarProduto } from "@/lib/produtos";
import { matchesConditions } from "@/lib/routing/conditions";
import type { RoutingContext } from "@/lib/routing/types";
import { createLeadSchema } from "@/lib/validators/lead";
import { ruleCondicoesSchema } from "@/lib/validators/rule";
import { webhookLeadPayloadSchema } from "@/lib/validators/webhook";

describe("normalizarProduto", () => {
  it("ausente ou vazio vira CGI (comportamento histórico)", () => {
    expect(normalizarProduto(undefined)).toBe("CGI");
    expect(normalizarProduto(null)).toBe("CGI");
    expect(normalizarProduto("  ")).toBe("CGI");
  });

  it("canoniza grafias do site e do portal", () => {
    expect(normalizarProduto("cgi")).toBe("CGI");
    expect(normalizarProduto("CONDOMINIO")).toBe("CONDOMINIO");
    expect(normalizarProduto("Condomínio")).toBe("CONDOMINIO");
    expect(normalizarProduto("condominios")).toBe("CONDOMINIO");
    expect(normalizarProduto("FINANCIAMENTO")).toBe("FINANCIAMENTO");
  });

  it("produto desconhecido é rejeitado, não vira CGI", () => {
    expect(normalizarProduto("consorcio")).toBeNull();
  });
});

describe("ehCgi", () => {
  it("só CGI liga as automações de pessoa física", () => {
    expect(ehCgi({ produto: "CGI" })).toBe(true);
    expect(ehCgi({ produto: "CONDOMINIO" })).toBe(false);
    expect(ehCgi({ produto: "FINANCIAMENTO" })).toBe(false);
  });

  it("row sem produto conta como CGI", () => {
    expect(ehCgi({ produto: null })).toBe(true);
    expect(ehCgi({ produto: undefined })).toBe(true);
  });
});

describe("produto nos validators", () => {
  const base = { nome: "Maria Silva", whatsapp: "47999990000" };

  it("webhook: payload do site sem produto segue CGI", () => {
    const r = webhookLeadPayloadSchema.parse(base);
    expect(r.produto ?? "CGI").toBe("CGI");
  });

  it("webhook: aceita o CONDOMINIO que o portal já envia", () => {
    const r = webhookLeadPayloadSchema.parse({ ...base, produto: "CONDOMINIO" });
    expect(r.produto).toBe("CONDOMINIO");
  });

  it("webhook: produto desconhecido falha a validação", () => {
    const r = webhookLeadPayloadSchema.safeParse({ ...base, produto: "consorcio" });
    expect(r.success).toBe(false);
  });

  it("criação manual: canoniza e rejeita desconhecido", () => {
    expect(createLeadSchema.parse({ ...base, produto: "condomínio" }).produto).toBe(
      "CONDOMINIO",
    );
    expect(createLeadSchema.safeParse({ ...base, produto: "xpto" }).success).toBe(false);
  });
});

describe("roteamento por produto", () => {
  const ctx: RoutingContext = {
    valorCreditoCentavos: 50_000_000,
    valorImovelCentavos: null,
    estado: "SC",
    origem: "Portal de Parceiros",
    tipoImovel: null,
    horarioComercial: true,
  };

  it("regra sem produto_in vale pra qualquer produto", () => {
    expect(matchesConditions({ ...ctx, produto: "CONDOMINIO" }, {})).toBe(true);
  });

  it("produto_in filtra", () => {
    const conds = { produto_in: ["CONDOMINIO"] };
    expect(matchesConditions({ ...ctx, produto: "CONDOMINIO" }, conds)).toBe(true);
    expect(matchesConditions({ ...ctx, produto: "CGI" }, conds)).toBe(false);
  });

  it("contexto sem produto conta como CGI", () => {
    expect(matchesConditions(ctx, { produto_in: ["CGI"] })).toBe(true);
    expect(matchesConditions(ctx, { produto_in: ["CONDOMINIO"] })).toBe(false);
  });

  it("schema da regra aceita produto_in e recusa produto inexistente", () => {
    expect(ruleCondicoesSchema.safeParse({ produto_in: ["CONDOMINIO"] }).success).toBe(true);
    expect(ruleCondicoesSchema.safeParse({ produto_in: ["XPTO"] }).success).toBe(false);
  });
});

describe("aceitaContatoAutomatizado", () => {
  it("CGI do site aceita", () => {
    expect(aceitaContatoAutomatizado({ produto: "CGI", source: "Google Ads" })).toBe(true);
  });

  it("cliente de parceiro nunca recebe contato automatizado", () => {
    expect(aceitaContatoAutomatizado({ produto: "CGI", parceiroId: "p1" })).toBe(false);
    expect(aceitaContatoAutomatizado({ produto: "CGI", parceiroPortalId: "ckx" })).toBe(false);
    expect(
      aceitaContatoAutomatizado({ produto: "CGI", source: "Portal de Parceiros" }),
    ).toBe(false);
  });

  it("outro produto também não", () => {
    expect(aceitaContatoAutomatizado({ produto: "CONDOMINIO" })).toBe(false);
  });
});
