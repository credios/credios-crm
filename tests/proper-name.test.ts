import { describe, expect, it } from "vitest";

import { formatProperName } from "@/lib/formatters/proper-name";

describe("formatProperName", () => {
  it("normaliza tudo maiúsculo para Title Case", () => {
    expect(formatProperName("FABIANA")).toBe("Fabiana");
    expect(formatProperName("MARIA SILVA")).toBe("Maria Silva");
  });

  it("normaliza tudo minúsculo para Title Case", () => {
    expect(formatProperName("fabiana")).toBe("Fabiana");
    expect(formatProperName("joão pedro")).toBe("João Pedro");
  });

  it("normaliza caixa misturada", () => {
    expect(formatProperName("FaBiAnA")).toBe("Fabiana");
    expect(formatProperName("jOãO pEdRo")).toBe("João Pedro");
  });

  it("preposições/conjunções ficam minúsculas no meio", () => {
    expect(formatProperName("MARIA DA SILVA")).toBe("Maria da Silva");
    expect(formatProperName("joão de souza dos santos")).toBe(
      "João de Souza dos Santos",
    );
    expect(formatProperName("ana e clara")).toBe("Ana e Clara");
  });

  it("primeira palavra é capitalizada mesmo sendo preposição", () => {
    expect(formatProperName("DA SILVA")).toBe("Da Silva");
    expect(formatProperName("de oliveira")).toBe("De Oliveira");
  });

  it("trata hífens corretamente", () => {
    expect(formatProperName("MARIA-LUIZA")).toBe("Maria-Luiza");
    expect(formatProperName("ana-beatriz dos santos")).toBe(
      "Ana-Beatriz dos Santos",
    );
  });

  it("trata apóstrofos", () => {
    expect(formatProperName("D'ARC")).toBe("D'Arc");
    expect(formatProperName("joana d'arc")).toBe("Joana D'Arc");
  });

  it("ignora espaços em branco extras", () => {
    expect(formatProperName("  MARIA   SILVA  ")).toBe("Maria Silva");
  });

  it("aceita null/undefined/string vazia", () => {
    expect(formatProperName(null)).toBe("");
    expect(formatProperName(undefined)).toBe("");
    expect(formatProperName("")).toBe("");
    expect(formatProperName("   ")).toBe("");
  });

  it("nomes estrangeiros com partículas comuns", () => {
    expect(formatProperName("LUDWIG VAN BEETHOVEN")).toBe(
      "Ludwig van Beethoven",
    );
    expect(formatProperName("juan de la cruz")).toBe("Juan de la Cruz");
  });
});
