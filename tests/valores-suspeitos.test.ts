import { describe, expect, it } from "vitest";

import {
  calcularValoresCorrigidos,
  detectarValoresSuspeitos,
  listarCamposSuspeitos,
  THRESHOLD_CREDITO_REAIS,
  THRESHOLD_IMOVEL_REAIS,
  THRESHOLD_RENDA_REAIS,
} from "@/lib/leads/valores-suspeitos";

describe("detectarValoresSuspeitos", () => {
  it("retorna null quando todos valores estão dentro dos thresholds", () => {
    const result = detectarValoresSuspeitos({
      rendaMensal: 15_000,
      valorImovel: 800_000,
      valorCredito: 300_000,
    });
    expect(result).toBeNull();
  });

  it("retorna null quando input é vazio", () => {
    expect(detectarValoresSuspeitos({})).toBeNull();
    expect(
      detectarValoresSuspeitos({
        rendaMensal: null,
        valorImovel: null,
        valorCredito: null,
      }),
    ).toBeNull();
  });

  it("aceita valores exatamente no threshold (boundary)", () => {
    const result = detectarValoresSuspeitos({
      rendaMensal: THRESHOLD_RENDA_REAIS,
      valorImovel: THRESHOLD_IMOVEL_REAIS,
      valorCredito: THRESHOLD_CREDITO_REAIS,
    });
    expect(result).toBeNull();
  });

  it("marca renda quando estoura R$ 1M", () => {
    const result = detectarValoresSuspeitos({
      rendaMensal: 6_000_000,
      valorImovel: 500_000,
      valorCredito: 200_000,
    });
    expect(result).not.toBeNull();
    expect(result?.campos).toEqual({ renda: true });
    expect(result?.valoresOriginais.renda).toBe(6_000_000);
  });

  it("marca imóvel quando estoura R$ 30M", () => {
    const result = detectarValoresSuspeitos({
      rendaMensal: 20_000,
      valorImovel: 110_000_000,
      valorCredito: 500_000,
    });
    expect(result?.campos).toEqual({ imovel: true });
    expect(result?.valoresOriginais.imovel).toBe(110_000_000);
  });

  it("marca crédito quando estoura R$ 10M", () => {
    const result = detectarValoresSuspeitos({
      rendaMensal: 20_000,
      valorImovel: 1_000_000,
      valorCredito: 30_000_000,
    });
    expect(result?.campos).toEqual({ credito: true });
  });

  it("marca múltiplos campos simultaneamente (caso típico)", () => {
    const result = detectarValoresSuspeitos({
      rendaMensal: 6_000_000,
      valorImovel: 110_000_000,
      valorCredito: 30_000_000,
    });
    expect(result?.campos).toEqual({
      renda: true,
      imovel: true,
      credito: true,
    });
  });
});

describe("calcularValoresCorrigidos", () => {
  it("divide por 1000 só os campos suspeitos", () => {
    const input = {
      rendaMensal: 6_000_000,
      valorImovel: 110_000_000,
      valorCredito: 25_000, // dentro do threshold
    };
    const suspeitos = detectarValoresSuspeitos(input)!;
    expect(suspeitos.campos).toEqual({ renda: true, imovel: true });

    const corrigidos = calcularValoresCorrigidos(input, suspeitos);
    expect(corrigidos.rendaMensal).toBe(6_000);
    expect(corrigidos.valorImovel).toBe(110_000);
    expect(corrigidos.valorCredito).toBe(25_000); // intacto
  });

  it("preserva nulls em campos não informados", () => {
    const input = { rendaMensal: 5_000_000, valorImovel: null, valorCredito: null };
    const suspeitos = detectarValoresSuspeitos(input)!;
    const corrigidos = calcularValoresCorrigidos(input, suspeitos);
    expect(corrigidos.rendaMensal).toBe(5_000);
    expect(corrigidos.valorImovel).toBeNull();
    expect(corrigidos.valorCredito).toBeNull();
  });

  it("arredonda divisões fracionárias", () => {
    const input = { rendaMensal: 6_500_001, valorImovel: null, valorCredito: null };
    const suspeitos = detectarValoresSuspeitos(input)!;
    const corrigidos = calcularValoresCorrigidos(input, suspeitos);
    expect(corrigidos.rendaMensal).toBe(6_500); // 6500.001 → 6500
  });
});

describe("listarCamposSuspeitos", () => {
  it("retorna lista ordenada de campos suspeitos com seus valores", () => {
    const input = {
      rendaMensal: 6_000_000,
      valorImovel: 110_000_000,
      valorCredito: 25_000,
    };
    const suspeitos = detectarValoresSuspeitos(input)!;
    const lista = listarCamposSuspeitos(suspeitos);
    expect(lista).toEqual([
      { campo: "renda", valor: 6_000_000 },
      { campo: "imovel", valor: 110_000_000 },
    ]);
  });
});
