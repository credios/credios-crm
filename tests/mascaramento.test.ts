import { describe, expect, it } from "vitest";

import {
  isValidCnpj,
  isValidCpf,
  isValidCpfOrCnpj,
} from "@/lib/formatters/cpf-cnpj";
import {
  maskCpf,
  maskEmail,
  maskLeadForPerfil,
  shouldMaskFinancial,
  shouldMaskFor,
} from "@/lib/auth/mascaramento";

describe("mascaramento — perfil-aware", () => {
  describe("shouldMaskFor: PII", () => {
    it("marketing → true", () => {
      expect(shouldMaskFor("marketing")).toBe(true);
    });
    for (const p of ["admin", "gerente", "consultor"] as const) {
      it(`${p} → false`, () => {
        expect(shouldMaskFor(p)).toBe(false);
      });
    }
  });

  describe("shouldMaskFinancial: receita/comissão", () => {
    it("admin → false (vê tudo)", () => {
      expect(shouldMaskFinancial("admin")).toBe(false);
    });
    for (const p of ["gerente", "consultor", "marketing"] as const) {
      it(`${p} → true`, () => {
        expect(shouldMaskFinancial(p)).toBe(true);
      });
    }
  });

  describe("maskLeadForPerfil — comportamento composto", () => {
    const lead = {
      cpf: "12345678901",
      rendaMensalCentavos: 800_000, // R$ 8k
      whatsapp: "+5511999999999",
      email: "ana@example.com",
      bancoAprovador: "Itaú",
      valorLiberadoCentavos: 50_000_00,
      comissaoCentavos: 1_000_00,
    };

    it("admin recebe TUDO sem mascarar", () => {
      const m = maskLeadForPerfil(lead, "admin");
      expect(m.cpf).toBe("12345678901");
      expect(m.email).toBe("ana@example.com");
      expect(m.whatsapp).toBe("+5511999999999");
      expect(m.bancoAprovador).toBe("Itaú");
      expect(m.valorLiberadoCentavos).toBe(5000000);
      expect(m.comissaoCentavos).toBe(100000);
    });

    it("gerente: só esconde financeiro (banco/liberado/comissão)", () => {
      const m = maskLeadForPerfil(lead, "gerente");
      expect(m.cpf).toBe("12345678901"); // PII OK pra gerente
      expect(m.email).toBe("ana@example.com");
      expect(m.bancoAprovador).toBeNull();
      expect(m.valorLiberadoCentavos).toBeNull();
      expect(m.comissaoCentavos).toBeNull();
    });

    it("consultor: só esconde financeiro", () => {
      const m = maskLeadForPerfil(lead, "consultor");
      expect(m.cpf).toBe("12345678901");
      expect(m.bancoAprovador).toBeNull();
      expect(m.comissaoCentavos).toBeNull();
    });

    it("marketing: PII E financeiro mascarados", () => {
      const m = maskLeadForPerfil(lead, "marketing");
      expect(m.cpf).toMatch(/^\*{3}\.\*{3}\.\*{3}-\d{2}$/);
      expect(m.email).toBe("***@example.com");
      expect(m.whatsapp).toBeNull();
      expect(m.bancoAprovador).toBeNull();
      expect(m.valorLiberadoCentavos).toBeNull();
      expect(m.comissaoCentavos).toBeNull();
    });
  });

  describe("maskCpf format", () => {
    it("últimos 2 dígitos visíveis", () => {
      expect(maskCpf("12345678901")).toBe("***.***.***-01");
    });
    it("null/undefined → null", () => {
      expect(maskCpf(null)).toBeNull();
      expect(maskCpf(undefined)).toBeNull();
    });
  });

  describe("maskEmail format", () => {
    it("preserva domínio", () => {
      expect(maskEmail("ana.silva@gmail.com")).toBe("***@gmail.com");
    });
  });
});

describe("CPF/CNPJ — validador (algoritmo Receita Federal)", () => {
  describe("CPF válidos (DV correto)", () => {
    // CPFs de teste construídos algoritmicamente
    const validos = ["11144477735", "12345678909", "98765432100"];
    for (const cpf of validos) {
      it(`${cpf} válido`, () => {
        expect(isValidCpf(cpf)).toBe(true);
      });
    }
  });

  describe("CPF inválidos", () => {
    it("rejeita sequência 11111111111", () => {
      expect(isValidCpf("11111111111")).toBe(false);
    });
    it("rejeita 12345678900 (DV errado)", () => {
      expect(isValidCpf("12345678900")).toBe(false);
    });
    it("rejeita string vazia", () => {
      expect(isValidCpf("")).toBe(false);
    });
    it("rejeita null", () => {
      expect(isValidCpf(null)).toBe(false);
    });
    it("rejeita comprimento errado", () => {
      expect(isValidCpf("123")).toBe(false);
    });
  });

  describe("CNPJ", () => {
    it("11222333000181 válido", () => {
      expect(isValidCnpj("11222333000181")).toBe(true);
    });
    it("rejeita sequência repetida", () => {
      expect(isValidCnpj("11111111111111")).toBe(false);
    });
    it("rejeita comprimento errado", () => {
      expect(isValidCnpj("123")).toBe(false);
    });
  });

  describe("isValidCpfOrCnpj — discriminator", () => {
    it("11 dígitos válido → CPF", () => {
      expect(isValidCpfOrCnpj("11144477735")).toBe(true);
    });
    it("14 dígitos válido → CNPJ", () => {
      expect(isValidCpfOrCnpj("11222333000181")).toBe(true);
    });
    it("12 dígitos → false (não é nem CPF nem CNPJ)", () => {
      expect(isValidCpfOrCnpj("123456789012")).toBe(false);
    });
  });
});
