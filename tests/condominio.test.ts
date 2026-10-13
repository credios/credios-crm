import { describe, expect, it } from "vitest";

import {
  condominioDoWebhook,
  condominioEnviado,
  condominioSchema,
} from "@/lib/validators/condominio";
import { createLeadSchema } from "@/lib/validators/lead";
import { webhookLeadPayloadSchema } from "@/lib/validators/webhook";

// CNPJ e CPF sinteticamente válidos (dígitos verificadores corretos).
const CNPJ = "11.222.333/0001-81";
const CPF = "529.982.247-25";

describe("condominioSchema", () => {
  it("tudo opcional: objeto vazio vira tudo null", () => {
    const r = condominioSchema.parse({});
    expect(r.cnpj).toBeNull();
    expect(r.sindicoNome).toBeNull();
  });

  it("CNPJ e CPF do síndico saem só com dígitos", () => {
    const r = condominioSchema.parse({ cnpj: CNPJ, sindicoCpf: CPF });
    expect(r.cnpj).toBe("11222333000181");
    expect(r.sindicoCpf).toBe("52998224725");
  });

  it("CNPJ com dígito verificador errado é rejeitado", () => {
    expect(condominioSchema.safeParse({ cnpj: "11.222.333/0001-82" }).success).toBe(false);
  });

  it("inadimplência fora de 0–100% é rejeitada", () => {
    expect(condominioSchema.safeParse({ inadimplenciaBps: 10_001 }).success).toBe(false);
    expect(condominioSchema.parse({ inadimplenciaBps: 850 }).inadimplenciaBps).toBe(850);
  });

  it("status de assembleia desconhecido é rejeitado", () => {
    expect(condominioSchema.safeParse({ assembleiaStatus: "talvez" }).success).toBe(false);
  });
});

describe("condominioEnviado", () => {
  it("PATCH parcial só devolve as chaves enviadas", () => {
    const bruto = { sindicoNome: "Ana", numUnidades: null };
    const out = condominioEnviado(bruto, condominioSchema.parse(bruto));
    expect(out).toEqual({ sindicoNome: "Ana", numUnidades: null });
    expect("cnpj" in out).toBe(false);
  });
});

describe("condominioDoWebhook", () => {
  it("converte reais → centavos e % → pontos-base", () => {
    const r = condominioDoWebhook({
      cnpj: CNPJ,
      sindico_nome: "Ana Souza",
      num_unidades: 48,
      arrecadacao_mensal: 85_000,
      inadimplencia_pct: 8.5,
      assembleia_status: "convocada",
      assembleia_data: "2026-11-20",
    });
    expect(r.cnpj).toBe("11222333000181");
    expect(r.arrecadacaoMensalCentavos).toBe(8_500_000);
    expect(r.inadimplenciaBps).toBe(850);
    expect(r.assembleiaStatus).toBe("convocada");
    expect(r.assembleiaData).toBe("2026-11-20");
  });

  it("documento, data e status inválidos viram null em vez de derrubar o lead", () => {
    const r = condominioDoWebhook({
      cnpj: "123",
      sindico_cpf: "000",
      assembleia_status: "xpto",
      assembleia_data: "20/11/2026",
      sindico_nome: "Ana",
    });
    expect(r.cnpj).toBeNull();
    expect(r.sindicoCpf).toBeNull();
    expect(r.assembleiaStatus).toBeNull();
    expect(r.assembleiaData).toBeNull();
    expect(r.sindicoNome).toBe("Ana");
  });
});

describe("condomínio nos schemas de lead", () => {
  const base = { nome: "Condomínio Solar", whatsapp: "47999990000" };

  it("criação manual aceita o bloco condominio e o parceiro indicador", () => {
    const r = createLeadSchema.parse({
      ...base,
      produto: "CONDOMINIO",
      parceiroId: "3f0c2c1e-8a5b-4d7e-9b1a-2c3d4e5f6a7b",
      condominio: { cnpj: CNPJ, numUnidades: 48 },
    });
    expect(r.produto).toBe("CONDOMINIO");
    expect(r.condominio?.cnpj).toBe("11222333000181");
    expect(r.condominio?.numUnidades).toBe(48);
  });

  it("webhook aceita o bloco condominio em snake_case", () => {
    const r = webhookLeadPayloadSchema.parse({
      ...base,
      produto: "CONDOMINIO",
      valor_credito: 300000,
      condominio: { cnpj: CNPJ, sindico_nome: "Ana", inadimplencia_pct: "7.2" },
    });
    expect(r.condominio?.sindico_nome).toBe("Ana");
    expect(r.condominio?.inadimplencia_pct).toBe(7.2);
  });
});
