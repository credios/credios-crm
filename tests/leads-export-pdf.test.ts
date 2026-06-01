import { describe, expect, it } from "vitest";

import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { buildLeadsExportHtml } from "@/lib/leads/leads-export-pdf";
import type { LeadRow } from "@/lib/leads/list-leads";

const GERADO_EM = new Date("2026-06-01T12:30:00-03:00");

function lead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    nome: "Maria Silva",
    cidade: "São Paulo",
    estado: "SP",
    status: "novo",
    valorCreditoCentavos: 35_000_000,
    createdAt: new Date("2026-05-20T09:00:00-03:00"),
    ultimoContato: new Date("2026-05-28T10:00:00-03:00"),
    ...overrides,
  } as unknown as LeadRow;
}

describe("buildLeadsExportHtml", () => {
  it("inclui os campos essenciais: nome, cidade, status, valor e datas", () => {
    const html = buildLeadsExportHtml([lead()], GERADO_EM);
    expect(html).toContain("Maria Silva");
    expect(html).toContain("São Paulo / SP");
    expect(html).toContain(STATUS_LEAD_LABEL["novo"]);
    expect(html).toContain("350.000,00"); // valor buscado (R$ via NBSP do Intl)
    expect(html).toContain("20/05/2026"); // criado em
    expect(html).toContain("28/05/2026"); // último contato
  });

  it("não inclui campos fora do essencial (sem excesso)", () => {
    const html = buildLeadsExportHtml(
      [lead({ cpf: "123" } as Partial<LeadRow>)],
      GERADO_EM,
    );
    expect(html).not.toContain("CPF");
    expect(html).not.toContain("E-mail");
    expect(html).not.toContain("Valor imóvel");
    expect(html).not.toContain("Consultor");
  });

  it("mostra contagem, data de geração e total buscado", () => {
    const html = buildLeadsExportHtml([lead(), lead()], GERADO_EM);
    expect(html).toContain("2 leads");
    expect(html).toContain("01/06/2026");
    expect(html).toContain("700.000,00"); // total buscado (2 × 350k)
  });

  it("usa singular para 1 lead", () => {
    const html = buildLeadsExportHtml([lead()], GERADO_EM);
    expect(html).toMatch(/1 lead\b/);
    expect(html).not.toContain("1 leads");
  });

  it("escapa HTML nos campos livres (anti-injeção)", () => {
    const html = buildLeadsExportHtml(
      [lead({ nome: "<script>alert(1)</script>" })],
      GERADO_EM,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("dispara a impressão ao carregar e fecha depois", () => {
    const html = buildLeadsExportHtml([lead()], GERADO_EM);
    expect(html).toContain('onload="window.print()"');
    expect(html).toContain("window.onafterprint");
  });

  it("lida com campos nulos sem quebrar", () => {
    const html = buildLeadsExportHtml(
      [
        lead({
          cidade: null,
          estado: null,
          valorCreditoCentavos: null,
          ultimoContato: null,
        }),
      ],
      GERADO_EM,
    );
    expect(html).toContain("Maria Silva");
    expect(html).toContain("—"); // placeholders para vazios
  });
});
