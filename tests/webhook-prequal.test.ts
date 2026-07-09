import { describe, expect, it } from "vitest";

import { webhookLeadPayloadSchema } from "@/lib/validators/webhook";

// Pré-qualificação automática do site: o /continuar-simulacao recusa leads por
// renda/saldo devedor e manda o enriquecimento com `auto_desqualificar` +
// `motivo_desqualificacao`. Estes testes garantem que o payload passa na
// validação do webhook (fluxo de enriquecimento) sem quebrar o payload padrão.

const basePayload = {
  nome: "Fulano de Tal",
  whatsapp: "+5511999999999",
};

describe("webhookLeadPayloadSchema — pré-qualificação do site", () => {
  it("aceita o payload de desqualificação automática", () => {
    const parsed = webhookLeadPayloadSchema.safeParse({
      ...basePayload,
      lead_id: "3f0e4a4e-95b1-4b7a-9f3e-0a1b2c3d4e5f",
      auto_desqualificar: true,
      motivo_desqualificacao: "Pré-qualificação do site: renda familiar abaixo do mínimo",
      renda_mensal: 3000,
      saldo_devedor: 150000,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.auto_desqualificar).toBe(true);
      expect(parsed.data.motivo_desqualificacao).toMatch(/^Pré-qualificação/);
    }
  });

  it("payload padrão (sem os campos novos) segue válido", () => {
    const parsed = webhookLeadPayloadSchema.safeParse(basePayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.auto_desqualificar).toBeUndefined();
      expect(parsed.data.motivo_desqualificacao).toBeUndefined();
    }
  });

  it("rejeita motivo acima de 500 caracteres", () => {
    const parsed = webhookLeadPayloadSchema.safeParse({
      ...basePayload,
      auto_desqualificar: true,
      motivo_desqualificacao: "x".repeat(501),
    });
    expect(parsed.success).toBe(false);
  });

  it("campos extras do site (credito_liquido) passam pelo passthrough", () => {
    const parsed = webhookLeadPayloadSchema.safeParse({
      ...basePayload,
      credito_liquido: 100000,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).credito_liquido).toBe(100000);
    }
  });
});
