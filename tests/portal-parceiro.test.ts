import { describe, expect, it } from "vitest";

import { prequalCgi, type CgiPrequalInput } from "@/lib/portal-parceiro/prequal";
import { hashSenha, validarSenha, verificarSenha } from "@/lib/portal-parceiro/senha";
import { etapaDoStatus, etapaEncerrada } from "@/lib/portal-parceiro/status";
import { gerarToken, hashToken } from "@/lib/portal-parceiro/tokens";
import { indicacaoSchema } from "@/lib/validators/indicacao";

describe("senha do parceiro (scrypt)", () => {
  it("confere a senha certa e recusa a errada", async () => {
    const h = await hashSenha("correta-cavalo-9");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verificarSenha("correta-cavalo-9", h)).toBe(true);
    expect(await verificarSenha("correta-cavalo-8", h)).toBe(false);
  });

  it("dois hashes da mesma senha são diferentes (salt)", async () => {
    expect(await hashSenha("mesma-senha-123")).not.toBe(await hashSenha("mesma-senha-123"));
  });

  it("hash ausente, malformado ou de outro formato nunca autentica", async () => {
    expect(await verificarSenha("x", null)).toBe(false);
    expect(await verificarSenha("x", "")).toBe(false);
    expect(await verificarSenha("x", "$2a$12$abcdefghijklmnopqrstuv")).toBe(false);
    expect(await verificarSenha("x", "scrypt$abc$8$1$AAAA$AAAA")).toBe(false);
  });

  it("validarSenha exige 10+ caracteres com letra e número", () => {
    expect(validarSenha("curta1")).not.toBeNull();
    expect(validarSenha("somenteletras")).not.toBeNull();
    expect(validarSenha("1234567890")).not.toBeNull();
    expect(validarSenha("senhaboa123")).toBeNull();
  });
});

describe("tokens de uso único", () => {
  it("o hash guardado bate com o token e não é o próprio token", () => {
    const { token, hash } = gerarToken();
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("etapas públicas da indicação", () => {
  it("traduz os status internos", () => {
    expect(etapaDoStatus("novo")).toBe("recebida");
    expect(etapaDoStatus("reuniao_agendada")).toBe("em_analise");
    expect(etapaDoStatus("aguardando_documentacao")).toBe("documentacao");
    expect(etapaDoStatus("em_negociacao")).toBe("em_credito");
    expect(etapaDoStatus("fechado")).toBe("liberada");
    expect(etapaDoStatus("desqualificado")).toBe("nao_aprovada");
    expect(etapaDoStatus("perdido")).toBe("cancelada");
  });

  it("status custom do admin nunca vaza: vira 'em análise'", () => {
    expect(etapaDoStatus("status_interno_qualquer")).toBe("em_analise");
  });

  it("encerradas", () => {
    expect(etapaEncerrada("liberada")).toBe(true);
    expect(etapaEncerrada("em_credito")).toBe(false);
  });
});

describe("pré-qualificação de CGI do parceiro", () => {
  const ok: CgiPrequalInput = {
    tipoImovel: "Apartamento",
    valorImovelCentavos: 80_000_000,
    valorCreditoCentavos: 30_000_000,
    rendaTitularCentavos: 1_000_000,
    rendaConjugeCentavos: 0,
    saldoDevedorCentavos: 0,
  };

  it("operação dentro da política passa", () => {
    expect(prequalCgi(ok)).toEqual({});
  });

  it("imóvel rural é recusado", () => {
    expect(prequalCgi({ ...ok, tipoImovel: "Imóvel rural" }).tipoImovel).toBeDefined();
  });

  it("LTV depende do tipo: casa de rua vai até 50%", () => {
    const casa = { ...ok, tipoImovel: "Casa de rua", valorCreditoCentavos: 45_000_000 };
    expect(prequalCgi(casa).valorCredito).toBeDefined();
    expect(prequalCgi({ ...casa, tipoImovel: "Apartamento" })).toEqual({});
  });

  it("pisos de imóvel, crédito e renda", () => {
    expect(prequalCgi({ ...ok, valorImovelCentavos: 20_000_000 }).valorImovel).toBeDefined();
    expect(prequalCgi({ ...ok, valorCreditoCentavos: 5_000_000 }).valorCredito).toBeDefined();
    expect(prequalCgi({ ...ok, rendaTitularCentavos: 300_000 }).rendaTitular).toBeDefined();
    // titular abaixo de 5k passa compondo com cônjuge e somando 8k
    expect(
      prequalCgi({ ...ok, rendaTitularCentavos: 400_000, rendaConjugeCentavos: 400_000 }),
    ).toEqual({});
  });

  it("saldo devedor ≥ 50% do imóvel é recusado", () => {
    expect(prequalCgi({ ...ok, saldoDevedorCentavos: 40_000_000 }).saldoDevedor).toBeDefined();
  });

  it("devolve todos os erros de uma vez", () => {
    const e = prequalCgi({ ...ok, valorImovelCentavos: 20_000_000, rendaTitularCentavos: 100_000 });
    expect(Object.keys(e).length).toBeGreaterThanOrEqual(2);
  });
});

describe("indicacaoSchema", () => {
  const comum = {
    whatsapp: "(47) 99999-0000",
    valorCreditoCentavos: 30_000_000,
    consentimento: true,
  };

  it("CGI válido", () => {
    const r = indicacaoSchema.safeParse({
      ...comum,
      produto: "CGI",
      nome: "Maria da Silva",
      documento: "529.982.247-25",
      tipoImovel: "Apartamento",
      valorImovelCentavos: 80_000_000,
      rendaTitularCentavos: 1_000_000,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.documento).toBe("52998224725");
  });

  it("condomínio exige CNPJ, síndico e finalidade", () => {
    const base = { ...comum, produto: "CONDOMINIO", nome: "Condomínio Solar" };
    expect(indicacaoSchema.safeParse({ ...base, documento: "529.982.247-25" }).success).toBe(false);
    expect(
      indicacaoSchema.safeParse({
        ...base,
        documento: "11.222.333/0001-81",
        sindicoNome: "Ana Souza",
        finalidade: "Elevadores",
      }).success,
    ).toBe(true);
  });

  it("sem consentimento LGPD não passa", () => {
    expect(
      indicacaoSchema.safeParse({
        ...comum,
        consentimento: false,
        produto: "CONDOMINIO",
        nome: "Condomínio Solar",
        documento: "11.222.333/0001-81",
        sindicoNome: "Ana Souza",
        finalidade: "Elevadores",
      }).success,
    ).toBe(false);
  });
});
