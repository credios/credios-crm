import { describe, expect, it } from "vitest";

import { SIMULACAO_FAIXA_DEFAULTS } from "@/lib/simulador/faixa-config";
import { buildProposta } from "@/lib/simulador/faixa";

// Valida o motor de faixa contra a proposta de referência do mercado
// (R$ 450.000, pós 1,00–1,59% a.m., prazos 60/120/180/240, destaque 240):
// IOF 15.210 · total 465.210 · PRICE 240m 5.122,36–7.568,54 · SAC 240m 1ª
// 6.590,48–9.335,21 · taxa a.a. 12,68–20,84 · CET 1,05–1,64% a.m. ·
// renda mínima (30%) 17.074,54.

const INPUT = {
  clientName: "Gabriel",
  clientCPF: "",
  creditAmount: 450_000,
  propertyValue: 1_500_000,
  indexation: "pos" as const,
};

describe("buildProposta (faixa)", () => {
  const r = buildProposta(INPUT, SIMULACAO_FAIXA_DEFAULTS, {
    simulationId: "HE-2026-0001",
    generatedAt: new Date("2026-06-23T12:00:00Z"),
  });

  it("IOF e total tomado batem com a referência", () => {
    expect(r.iof).toBeCloseTo(15_210, 0);
    expect(r.totalTomado).toBeCloseTo(465_210, 0);
  });

  it("PRICE 240m: faixa de parcela 5.122,36–7.568,54", () => {
    const l240 = r.linhas.find((l) => l.prazo === 240)!;
    expect(l240.price.min).toBeCloseTo(5122.36, 0);
    expect(l240.price.max).toBeCloseTo(7568.54, 0);
    expect(l240.destaque).toBe(true);
  });

  it("PRICE 60m: faixa 10.348,34–12.088,29", () => {
    const l60 = r.linhas.find((l) => l.prazo === 60)!;
    expect(l60.price.min).toBeCloseTo(10_348.34, 0);
    expect(l60.price.max).toBeCloseTo(12_088.29, 0);
  });

  it("SAC 240m: 1ª parcela 6.590,48–9.335,21", () => {
    const l240 = r.linhas.find((l) => l.prazo === 240)!;
    expect(l240.sacPrimeira.min).toBeCloseTo(6590.48, 0);
    expect(l240.sacPrimeira.max).toBeCloseTo(9335.21, 0);
  });

  it("taxa anualizada 12,68–20,84% a.a.", () => {
    expect(r.taxaAa.min).toBeCloseTo(12.68, 1);
    expect(r.taxaAa.max).toBeCloseTo(20.84, 1);
  });

  it("CET ~1,05–1,64% a.m. e ~13,35–21,56% a.a.", () => {
    expect(r.cetAm.min).toBeCloseTo(1.05, 1);
    expect(r.cetAm.max).toBeCloseTo(1.64, 1);
    expect(r.cetAa.min).toBeCloseTo(13.35, 0);
    expect(r.cetAa.max).toBeCloseTo(21.56, 0);
  });

  it("renda mínima sugerida = parcela mín destaque / 30%", () => {
    expect(r.rendaMinimaSugerida).toBeCloseTo(17_074.54, 0);
  });

  it("pré-fixado usa a faixa pré da config", () => {
    const pre = buildProposta(
      { ...INPUT, indexation: "pre" },
      SIMULACAO_FAIXA_DEFAULTS,
      { simulationId: "HE-2026-0002" },
    );
    expect(pre.taxaAm).toEqual({ min: 1.39, max: 1.99 });
    expect(pre.modalidadeLabel).toBe("Pré-fixada");
  });

  it("validade = hoje + validadeDias", () => {
    expect(r.generatedAt).toBe("2026-06-23");
    expect(r.validUntil).toBe("2026-07-23");
  });
});
