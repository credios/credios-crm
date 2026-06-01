import { describe, expect, it } from "vitest";

import { buildLeadAssignedSlackMessage } from "@/lib/notifications/slack-message";

type LeadLike = Parameters<typeof buildLeadAssignedSlackMessage>[0];

function lead(overrides: Record<string, unknown> = {}): LeadLike {
  return {
    id: "abc-123",
    nome: "Maria Silva",
    cidade: "São Paulo",
    estado: "SP",
    status: "novo",
    valorCreditoCentavos: 35_000_000,
    ...overrides,
  } as unknown as LeadLike;
}

describe("buildLeadAssignedSlackMessage", () => {
  it("monta text (fallback) com nome, valor e cidade", () => {
    const { text } = buildLeadAssignedSlackMessage(lead(), "Gabriel Meirelles");
    expect(text).toContain("Maria Silva");
    expect(text).toContain("350.000,00");
    expect(text).toContain("São Paulo / SP");
  });

  it("usa o primeiro nome do consultor na saudação", () => {
    const { blocks } = buildLeadAssignedSlackMessage(lead(), "Gabriel Meirelles");
    const json = JSON.stringify(blocks);
    expect(json).toContain("Gabriel,");
    expect(json).not.toContain("Gabriel Meirelles,");
  });

  it("inclui valor, status e botão com link pro lead no CRM", () => {
    const { blocks } = buildLeadAssignedSlackMessage(lead(), "Ana");
    const json = JSON.stringify(blocks);
    expect(json).toContain("Valor buscado");
    expect(json).toContain("350.000,00");
    expect(json).toContain("Abrir lead no CRM");
    expect(json).toContain("/leads/abc-123");
  });

  it("lida com cidade/valor nulos sem quebrar", () => {
    const { text, blocks } = buildLeadAssignedSlackMessage(
      lead({ cidade: null, estado: null, valorCreditoCentavos: null }),
      "Carlos",
    );
    expect(text).toContain("Maria Silva");
    expect(JSON.stringify(blocks)).toContain("—");
  });
});
