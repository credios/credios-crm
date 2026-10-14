import { describe, expect, it } from "vitest";

import {
  detectKind,
  formatCpfOrCnpj,
  isValidCnpj,
  isValidCpf,
  limparDocumento,
  maskCnpj,
  maskCpfCnpj,
} from "@/lib/formatters/cpf-cnpj";
import { condominioSchema } from "@/lib/validators/condominio";
import { indicacaoSchema } from "@/lib/validators/indicacao";

describe("CNPJ alfanumérico (Receita, a partir de julho/2026)", () => {
  it("valida o exemplo oficial 12.ABC.345/01DE-35", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
  });

  it("CNPJ numérico continua validando igual", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
  });

  it("dígitos verificadores são sempre numéricos", () => {
    expect(isValidCnpj("12ABC34501DEAB")).toBe(false);
  });

  it("limpa, detecta e formata", () => {
    expect(limparDocumento("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(detectKind("12.ABC.345/01DE-35")).toBe("cnpj");
    expect(detectKind("529.982.247-25")).toBe("cpf");
    expect(maskCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(formatCpfOrCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    // máscara progressiva: letra só existe em CNPJ
    expect(maskCpfCnpj("12abc")).toBe("12.ABC");
    expect(maskCpfCnpj("52998224725")).toBe("529.982.247-25");
  });

  it("CPF não aceita letras", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.98A.247-25")).toBe(false);
  });

  it("condomínio e indicação aceitam e guardam o CNPJ com letras", () => {
    expect(condominioSchema.parse({ cnpj: "12.abc.345/01de-35" }).cnpj).toBe("12ABC34501DE35");
    const r = indicacaoSchema.safeParse({
      produto: "CONDOMINIO",
      nome: "Condomínio Novo",
      documento: "12.ABC.345/01DE-35",
      sindicoNome: "Ana Souza",
      finalidade: "Elevadores",
      whatsapp: "(47) 99999-0000",
      valorCreditoCentavos: 30_000_000,
      consentimento: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.documento).toBe("12ABC34501DE35");
  });
});

// `comissoes.ts` e `avisos.ts` importam o banco; aqui só as partes puras.
describe("tipo de arquivo pelos primeiros bytes", () => {
  it("reconhece PDF, PNG e JPEG e recusa o resto", async () => {
    const { tipoDoArquivo } = await import("@/lib/parceiros/arquivo");
    expect(tipoDoArquivo(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(tipoDoArquivo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(tipoDoArquivo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    // .exe renomeado pra .pdf
    expect(tipoDoArquivo(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(tipoDoArquivo(new Uint8Array([]))).toBeNull();
  });

  it("vencimento = data + dias corridos, virando mês e ano", async () => {
    const { somarDias } = await import("@/lib/parceiros/arquivo");
    expect(somarDias("2026-10-13", 10)).toBe("2026-10-23");
    expect(somarDias("2026-10-25", 10)).toBe("2026-11-04");
    expect(somarDias("2026-12-28", 10)).toBe("2027-01-07");
  });
});
