import { describe, expect, it } from "vitest";

import { getSaudacao, renderTemplate, type TemplateLeadVars } from "@/lib/templates";

// ============================================================================
// getSaudacao — faixas de horário
// ============================================================================
describe("getSaudacao", () => {
  // Helper: cria Date com hora local arbitrária (mês/dia/ano fixos pra
  // determinismo, hora variável). new Date(year, month, day, hour) usa
  // timezone local — alinhado com o que getSaudacao consome.
  // Instante com hora H em BRT (UTC-3), independente do timezone da máquina.
  const at = (h: number) => new Date(Date.UTC(2026, 0, 15, h + 3, 0, 0));

  it("retorna 'Bom dia' entre 0h e 11h59", () => {
    expect(getSaudacao(at(0))).toBe("Bom dia");
    expect(getSaudacao(at(5))).toBe("Bom dia");
    expect(getSaudacao(at(11))).toBe("Bom dia");
  });

  it("retorna 'Boa tarde' entre 12h e 17h59", () => {
    expect(getSaudacao(at(12))).toBe("Boa tarde");
    expect(getSaudacao(at(15))).toBe("Boa tarde");
    expect(getSaudacao(at(17))).toBe("Boa tarde");
  });

  it("retorna 'Boa noite' entre 18h e 23h59", () => {
    expect(getSaudacao(at(18))).toBe("Boa noite");
    expect(getSaudacao(at(21))).toBe("Boa noite");
    expect(getSaudacao(at(23))).toBe("Boa noite");
  });

  it("muda exatamente nos limites (12h e 18h)", () => {
    // 11:59 ainda manhã
    expect(getSaudacao(new Date(2026, 0, 15, 11, 59))).toBe("Bom dia");
    // 12:00 vira tarde
    expect(getSaudacao(new Date(2026, 0, 15, 12, 0))).toBe("Boa tarde");
    // 17:59 ainda tarde
    expect(getSaudacao(new Date(2026, 0, 15, 17, 59))).toBe("Boa tarde");
    // 18:00 vira noite
    expect(getSaudacao(new Date(2026, 0, 15, 18, 0))).toBe("Boa noite");
  });
});

// ============================================================================
// renderTemplate — substitui {{saudacao}} + variáveis existentes
// ============================================================================
describe("renderTemplate", () => {
  const baseLead: TemplateLeadVars = {
    nome: "MARIA SILVA",
    cidade: "Blumenau",
    estado: "SC",
    valorCreditoCentavos: 35_000_000,
    valorImovelCentavos: 80_000_000,
    consultor: "Gabriel Marinho",
  };

  it("substitui {{saudacao}} pela saudação correspondente ao horário atual", () => {
    const out = renderTemplate("{{saudacao}}, {{primeiro_nome}}!", baseLead);
    // Não testamos qual saudação (depende da hora do test runner),
    // apenas que foi substituída — não sobrou o placeholder.
    expect(out).not.toContain("{{saudacao}}");
    expect(out).toMatch(/^(Bom dia|Boa tarde|Boa noite), Maria!$/);
  });

  it("não toca em ocorrências sem chaves duplas", () => {
    // 'saudacao' sozinho (sem {{}}) não deve ser substituído
    const out = renderTemplate("saudacao = teste", baseLead);
    expect(out).toBe("saudacao = teste");
  });

  it("preserva substituição de variáveis existentes", () => {
    const out = renderTemplate(
      "{{saudacao}}, {{primeiro_nome}}! Sua proposta de {{valor_credito}}.",
      baseLead,
    );
    expect(out).toContain(", Maria!");
    // formatBrlFromCents usa NBSP entre R$ e número (Intl PT-BR)
    expect(out).toMatch(/R\$\s350\.000,00/);
  });

  it("múltiplas ocorrências de {{saudacao}} no mesmo template", () => {
    const out = renderTemplate("{{saudacao}}! {{saudacao}}!", baseLead);
    // As duas saudações devem ser iguais (mesmo horário de execução)
    const parts = out.split("! ");
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe(parts[1]?.replace(/!$/, ""));
  });
});
