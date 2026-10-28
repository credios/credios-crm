import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  buildSimulacaoCondominio,
  CODIGO_SIMULACAO_CONDOMINIO_REGEX,
  gerarCodigoSimulacaoCondominio,
  iofPrice,
} from "@/lib/simulador/condominio";
import {
  SIMULACAO_CONDOMINIO_DEFAULTS,
  saneSimulacaoCondominioConfig,
} from "@/lib/simulador/condominio-config";
import { renderSimulacaoCondominioPdf } from "@/lib/simulador/condominio-pdf";
import { simulacaoCondominioSchema } from "@/lib/validators/simulacao-condominio";

const input = {
  condominioNome: "Condomínio Residencial Jardim das Acácias",
  cnpj: "11222333000181",
  valorCredito: 850_000,
  numUnidades: 120,
  finalidade: "Fachada e pintura",
  parceiro: { nome: "Prime Administradora", email: "a@b.com.br" },
};

describe("config da simulação de condomínio", () => {
  it("default: 2,5% a.m. em 6, 12, 18, 24, 36, 48 e 60 meses", () => {
    const c = saneSimulacaoCondominioConfig(null);
    expect(c.prazos.map((p) => p.meses)).toEqual([6, 12, 18, 24, 36, 48, 60]);
    expect(c.prazos.every((p) => p.taxaAm === 2.5)).toBe(true);
  });

  it("ordena, deduplica e descarta prazos/taxas inválidos", () => {
    const c = saneSimulacaoCondominioConfig({
      prazos: [
        { meses: 60, taxaAm: 1.99 },
        { meses: 6, taxaAm: 2.9 },
        { meses: 6, taxaAm: 3.5 },
        { meses: 0, taxaAm: 2 },
        { meses: 12, taxaAm: -1 },
        { meses: "24", taxaAm: "2.4" },
      ],
    });
    expect(c.prazos).toEqual([
      { meses: 6, taxaAm: 2.9 },
      { meses: 24, taxaAm: 2.4 },
      { meses: 60, taxaAm: 1.99 },
    ]);
  });

  it("valor máximo sempre acima do mínimo", () => {
    const c = saneSimulacaoCondominioConfig({ valorMinimo: 50_000, valorMaximo: 10_000 });
    expect(c.valorMaximo).toBeGreaterThan(c.valorMinimo);
  });
});

describe("motor da simulação de condomínio", () => {
  const sim = buildSimulacaoCondominio(input, SIMULACAO_CONDOMINIO_DEFAULTS, {
    codigo: "CD-2026-000001",
    geradaEm: new Date("2026-10-20T12:00:00Z"),
  });

  it("uma linha por prazo, com Price sobre crédito + IOF", () => {
    expect(sim.linhas).toHaveLength(7);
    const l60 = sim.linhas.at(-1)!;
    // PMT(850.000 + IOF PJ 0,95% + 0,0082% a.d., 2,5%, 60) — conferido à mão: ≈ 28.548
    expect(l60.parcela).toBeCloseTo(28_547.85, 1);
    expect(l60.totalPago).toBeCloseTo(l60.parcela * 60, 6);
    expect(l60.porUnidade).toBeCloseTo(l60.parcela / 120, 6);
  });

  it("CET acima da taxa nominal quando há IOF", () => {
    for (const l of sim.linhas) expect(l.cetAm).toBeGreaterThan(l.taxaAm);
  });

  it("IOF PJ (Decreto 12.499/2025): 0,95% + diária com teto de 365 dias", () => {
    const cfg = { iofAdicionalPct: 0.95, iofDiarioPct: 0.0082 };
    // Prazo longo: diária quase toda no teto → perto de 0,95% + 2,993%.
    const iof = iofPrice(1_000_000, 2.5, 60, cfg);
    expect(iof).toBeGreaterThan(9_500 + 20_000);
    expect(iof).toBeLessThan(9_500 + 29_930);
    expect(iofPrice(1_000_000, 2.5, 60, { iofAdicionalPct: 0, iofDiarioPct: 0 })).toBe(0);
  });

  it("taxa diferente por prazo sai em cada linha", () => {
    const s = buildSimulacaoCondominio(
      input,
      { ...SIMULACAO_CONDOMINIO_DEFAULTS, prazos: [{ meses: 6, taxaAm: 3 }, { meses: 60, taxaAm: 2 }] },
      { codigo: "CD-2026-000002" },
    );
    expect(s.linhas.map((l) => l.taxaAm)).toEqual([3, 2]);
    expect(s.taxaMinAm).toBe(2);
    expect(s.taxaMaxAm).toBe(3);
  });

  it("validade = geração + dias da config", () => {
    expect(sim.geradaEm).toBe("2026-10-20");
    expect(sim.validaAte).toBe("2026-11-04");
  });

  it("código no formato CD-AAAA-NNNNNN", () => {
    expect(gerarCodigoSimulacaoCondominio(new Date("2026-01-01T12:00:00Z"), () => 0.0421)).toBe(
      "CD-2026-042100",
    );
    expect(CODIGO_SIMULACAO_CONDOMINIO_REGEX.test(gerarCodigoSimulacaoCondominio())).toBe(true);
  });

  it("gera PDF de 2 páginas mesmo com caracteres fora do WinAnsi", async () => {
    const bytes = await renderSimulacaoCondominioPdf({
      ...sim,
      condominioNome: "Condomínio Ação ≈ → 🏢",
      parceiro: { nome: "Parceiro “Ômega” Ltda", telefone: "+55 47 99999-0000" },
    });
    expect(Buffer.from(bytes).toString("latin1", 0, 4)).toBe("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});

describe("validação do formulário do portal", () => {
  it("aceita CNPJ com máscara e normaliza", () => {
    const r = simulacaoCondominioSchema.parse({
      condominioNome: "Edifício Solar",
      cnpj: "11.222.333/0001-81",
      valorCreditoCentavos: 50_000_000,
    });
    expect(r.cnpj).toBe("11222333000181");
    expect(r.numUnidades).toBeNull();
  });

  it("recusa CNPJ inválido e valor zerado", () => {
    const r = simulacaoCondominioSchema.safeParse({
      condominioNome: "Edifício Solar",
      cnpj: "11.222.333/0001-82",
      valorCreditoCentavos: 0,
    });
    expect(r.success).toBe(false);
  });
});
