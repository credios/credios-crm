import { describe, expect, it } from "vitest";

import { avaliarQualificacao, type FatosQualificacao } from "@/lib/sdr/qualificacao";

// Lead "ideal": passa em tudo. R$ 200k de crédito, imóvel R$ 1M (LTV 20%),
// quitado, regularizado, sem pendência, casa.
const base: FatosQualificacao = {
  valorCreditoCentavos: 20_000_000,
  valorImovelCentavos: 100_000_000,
  saldoDevedorCentavos: null,
  situacaoImovel: "Quitado",
  tipoImovel: "Casa",
  temImovelGarantia: true,
  imovelRegularizado: "sim",
  pendenciaBloqueante: false,
};

describe("avaliarQualificacao", () => {
  it("qualifica o lead ideal", () => {
    const r = avaliarQualificacao(base);
    expect(r.qualificado).toBe(true);
    expect(r.reprovados).toEqual([]);
    expect(r.faltando).toEqual([]);
  });

  it("reprova crédito abaixo de R$ 100k", () => {
    const r = avaliarQualificacao({ ...base, valorCreditoCentavos: 5_000_000 });
    expect(r.qualificado).toBe(false);
    expect(r.reprovados.some((x) => /100\.000/.test(x))).toBe(true);
  });

  it("reprova LTV acima de 60%", () => {
    // crédito R$ 70k sobre imóvel R$ 100k = 70%
    const r = avaliarQualificacao({
      ...base,
      valorCreditoCentavos: 70_000_000,
      valorImovelCentavos: 100_000_000,
    });
    expect(r.qualificado).toBe(false);
    expect(r.reprovados.some((x) => /LTV/.test(x))).toBe(true);
  });

  it("aceita LTV exatamente em 60%", () => {
    const r = avaliarQualificacao({
      ...base,
      valorCreditoCentavos: 60_000_000,
      valorImovelCentavos: 100_000_000,
    });
    expect(r.qualificado).toBe(true);
  });

  it("reprova quando não tem imóvel para garantia", () => {
    const r = avaliarQualificacao({ ...base, temImovelGarantia: false });
    expect(r.qualificado).toBe(false);
    expect(r.reprovados.some((x) => /garantia/.test(x))).toBe(true);
  });

  it("reprova imóvel não regularizado", () => {
    const r = avaliarQualificacao({ ...base, imovelRegularizado: "nao" });
    expect(r.qualificado).toBe(false);
  });

  it("reprova com pendência jurídica", () => {
    const r = avaliarQualificacao({ ...base, pendenciaBloqueante: true });
    expect(r.qualificado).toBe(false);
  });

  it("reprova tipo de imóvel 'Outros'", () => {
    const r = avaliarQualificacao({ ...base, tipoImovel: "Outros" });
    expect(r.qualificado).toBe(false);
    expect(r.reprovados.some((x) => /Outros/.test(x))).toBe(true);
  });

  it("financiado: reprova saldo em 50% ou mais do imóvel (régua unificada com o funil)", () => {
    const r = avaliarQualificacao({
      ...base,
      situacaoImovel: "Financiado",
      saldoDevedorCentavos: 50_000_000, // exatamente 50% de R$ 1M
    });
    expect(r.qualificado).toBe(false);
    expect(r.reprovados.some((x) => /saldo/.test(x))).toBe(true);
  });

  it("financiado: aceita saldo abaixo de 50% (30% e 49% passam)", () => {
    for (const saldo of [30_000_000, 49_000_000]) {
      const r = avaliarQualificacao({
        ...base,
        situacaoImovel: "Financiado",
        saldoDevedorCentavos: saldo,
      });
      expect(r.qualificado).toBe(true);
    }
  });

  it("dado faltando vira 'faltando', não reprovação", () => {
    const r = avaliarQualificacao({
      ...base,
      valorImovelCentavos: null,
      imovelRegularizado: null,
    });
    expect(r.qualificado).toBe(false);
    expect(r.reprovados).toEqual([]);
    expect(r.faltando.length).toBeGreaterThan(0);
  });
});
