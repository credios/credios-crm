import { describe, expect, it } from "vitest";

import {
  atualizarComissaoSchema,
  calcularComissao,
  criarComissaoSchema,
} from "@/lib/validators/comissao";

const LEAD = "3f0c2c1e-8a5b-4d7e-9b1a-2c3d4e5f6a7b";

describe("calcularComissao", () => {
  it("3% sobre R$ 500 mil = R$ 15 mil", () => {
    expect(calcularComissao(50_000_000, 300)).toBe(1_500_000);
  });

  it("arredonda pro centavo", () => {
    expect(calcularComissao(33_333, 150)).toBe(500); // 499,995 → 500
  });
});

describe("criarComissaoSchema (caso a caso)", () => {
  it("aceita só o valor", () => {
    expect(
      criarComissaoSchema.safeParse({ leadId: LEAD, valorCentavos: 1_000_000 }).success,
    ).toBe(true);
  });

  it("aceita base + percentual", () => {
    expect(
      criarComissaoSchema.safeParse({
        leadId: LEAD,
        baseCentavos: 50_000_000,
        percentualBps: 300,
      }).success,
    ).toBe(true);
  });

  it("recusa sem valor e sem como calcular", () => {
    expect(criarComissaoSchema.safeParse({ leadId: LEAD }).success).toBe(false);
    expect(
      criarComissaoSchema.safeParse({ leadId: LEAD, baseCentavos: 50_000_000 }).success,
    ).toBe(false);
  });

  it("recusa valor que não confere com base × percentual", () => {
    expect(
      criarComissaoSchema.safeParse({
        leadId: LEAD,
        baseCentavos: 50_000_000,
        percentualBps: 300,
        valorCentavos: 2_000_000,
      }).success,
    ).toBe(false);
  });

  it("sem operação exige descrição", () => {
    expect(criarComissaoSchema.safeParse({ valorCentavos: 1000 }).success).toBe(false);
    expect(
      criarComissaoSchema.safeParse({ valorCentavos: 1000, descricao: "Bônus" }).success,
    ).toBe(true);
  });

  it("percentual acima de 100% é recusado", () => {
    expect(
      criarComissaoSchema.safeParse({
        leadId: LEAD,
        baseCentavos: 1000,
        percentualBps: 10_001,
      }).success,
    ).toBe(false);
  });
});

describe("atualizarComissaoSchema", () => {
  it("marcar como paga exige a data", () => {
    expect(atualizarComissaoSchema.safeParse({ status: "paga" }).success).toBe(false);
    expect(
      atualizarComissaoSchema.safeParse({ status: "paga", pagoEm: "2026-10-20" }).success,
    ).toBe(true);
  });

  it("outros status não exigem data", () => {
    expect(atualizarComissaoSchema.safeParse({ status: "a_pagar" }).success).toBe(true);
  });
});
