import fs from "fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { calculatePricePMT } from "@/lib/simulador/financial";
import {
  buildSimulacaoFundo,
  CODIGO_SIMULACAO_FUNDO_REGEX,
  gerarCodigoSimulacaoFundo,
  type SimulacaoFundoInput,
  somaDiasYmd,
} from "@/lib/simulador/fundo";
import { nomeArquivoSimulacaoFundo, renderSimulacaoFundoPdf } from "@/lib/simulador/fundo-pdf";
import { simulacaoFundoSchema } from "@/lib/validators/simulacao-fundo";

const base: SimulacaoFundoInput = {
  valorCredito: 500_000,
  prazos: [
    { meses: 120, taxaAm: 1.59 },
    { meses: 36, taxaAm: 1.39 },
  ],
  iof: "PF",
  produto: "CGI",
  cliente: { nome: "João da Silva" },
  contato: { nome: "Gabriel Meirelles", email: "gabriel.meirelles@credios.com.br", whatsapp: "+5547999990001" },
};

describe("simulação do fundo — cálculo", () => {
  it("ordena por prazo e calcula a Price sobre crédito + IOF", () => {
    const sim = buildSimulacaoFundo(base, { codigo: "MC-2026-000001", geradaEm: "2026-10-28" });
    expect(sim.linhas.map((l) => l.meses)).toEqual([36, 120]);
    const l = sim.linhas[0]!;
    expect(l.parcela).toBeCloseTo(calculatePricePMT(500_000 + l.iof, 1.39, 36), 6);
    expect(l.totalPago).toBeCloseTo(l.parcela * 36, 6);
    // IOF PF em 36 meses: 0,38% + diária limitada a 365 dias → entre 0,38% e 3,38%.
    expect(l.iof).toBeGreaterThan(500_000 * 0.0038);
    expect(l.iof).toBeLessThan(500_000 * 0.0338);
    // IOF financiado → CET acima da taxa de juros.
    expect(l.cetAm).toBeGreaterThan(1.39);
    expect(l.taxaAa).toBeCloseTo((Math.pow(1.0139, 12) - 1) * 100, 8);
    expect(sim.menorParcela.meses).toBe(120);
  });

  it("sem IOF: CET igual à taxa e parcela da Price pura", () => {
    const sim = buildSimulacaoFundo(
      { ...base, iof: "nenhum", prazos: [{ meses: 60, taxaAm: 2 }] },
      { codigo: "MC-2026-000002", geradaEm: "2026-10-28" },
    );
    const l = sim.linhas[0]!;
    expect(l.iof).toBe(0);
    expect(l.parcela).toBeCloseTo(calculatePricePMT(500_000, 2, 60), 6);
    expect(l.cetAm).toBeCloseTo(2, 4);
  });

  it("PJ paga mais IOF que PF", () => {
    const pf = buildSimulacaoFundo({ ...base, iof: "PF" }, { codigo: "x", geradaEm: "2026-10-28" });
    const pj = buildSimulacaoFundo({ ...base, iof: "PJ" }, { codigo: "x", geradaEm: "2026-10-28" });
    expect(pj.linhas[0]!.iof).toBeGreaterThan(pf.linhas[0]!.iof);
  });

  it("validade de 30 dias, atravessando mês e ano", () => {
    expect(somaDiasYmd("2026-10-28", 30)).toBe("2026-11-27");
    expect(somaDiasYmd("2026-12-15", 30)).toBe("2027-01-14");
    const sim = buildSimulacaoFundo(base, { codigo: "x", geradaEm: "2026-10-28" });
    expect(sim.validaAte).toBe("2026-11-27");
  });

  it("código MC-AAAA-NNNNNN", () => {
    expect(gerarCodigoSimulacaoFundo(2026, () => 0.000123)).toBe("MC-2026-000123");
    expect(CODIGO_SIMULACAO_FUNDO_REGEX.test(gerarCodigoSimulacaoFundo(2026))).toBe(true);
  });
});

describe("simulação do fundo — validação", () => {
  it("aceita de 1 a 10 prazos e recusa repetidos", () => {
    expect(simulacaoFundoSchema.safeParse({ valorCredito: 1, prazos: [{ meses: 12, taxaAm: 1 }], iof: "PJ" }).success).toBe(true);
    expect(simulacaoFundoSchema.safeParse({ valorCredito: 1, prazos: [], iof: "PJ" }).success).toBe(false);
    const onze = Array.from({ length: 11 }, (_, i) => ({ meses: 12 + i, taxaAm: 1 }));
    expect(simulacaoFundoSchema.safeParse({ valorCredito: 1, prazos: onze, iof: "PJ" }).success).toBe(false);
    const rep = [{ meses: 12, taxaAm: 1 }, { meses: 12, taxaAm: 1 }];
    expect(simulacaoFundoSchema.safeParse({ valorCredito: 1, prazos: rep, iof: "PJ" }).success).toBe(false);
    // Mesmo prazo com taxas diferentes é cenário válido.
    const cenarios = [{ meses: 12, taxaAm: 1 }, { meses: 12, taxaAm: 1.5 }];
    expect(simulacaoFundoSchema.safeParse({ valorCredito: 1, prazos: cenarios, iof: "PJ" }).success).toBe(true);
  });

  it("recusa taxa zero e prazo fracionado", () => {
    expect(simulacaoFundoSchema.safeParse({ valorCredito: 1, prazos: [{ meses: 12, taxaAm: 0 }], iof: "PF" }).success).toBe(false);
    expect(simulacaoFundoSchema.safeParse({ valorCredito: 1, prazos: [{ meses: 12.5, taxaAm: 1 }], iof: "PF" }).success).toBe(false);
  });
});

describe("simulação do fundo — PDF", () => {
  it("gera uma página com as fontes da marca", async () => {
    const sim = buildSimulacaoFundo(
      {
        ...base,
        produto: "CONDOMINIO",
        iof: "PJ",
        cliente: { nome: "Condomínio Residencial Jardim das Acácias", cnpj: "11222333000181" },
        prazos: [12, 24, 36, 48, 60].map((meses) => ({ meses, taxaAm: 2.5 })),
      },
      { codigo: "MC-2026-004217", geradaEm: "2026-10-28" },
    );
    const bytes = await renderSimulacaoFundoPdf(sim);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(nomeArquivoSimulacaoFundo(sim)).toBe(
      "Musashi_Capital_Simulacao_MC-2026-004217_CONDOMINIO_RESIDENCIAL_JARDIM_DAS_ACACIAS.pdf",
    );
    if (process.env.SIMULACAO_FUNDO_PDF_OUT) {
      fs.writeFileSync(process.env.SIMULACAO_FUNDO_PDF_OUT, bytes);
      const um = buildSimulacaoFundo(base, { codigo: "MC-2026-000777", geradaEm: "2026-10-28" });
      fs.writeFileSync(process.env.SIMULACAO_FUNDO_PDF_OUT.replace(".pdf", "-cgi.pdf"), await renderSimulacaoFundoPdf(um));
    }
  });
});
