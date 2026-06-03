import { describe, expect, it } from "vitest";

import {
  createSavedViewSchema,
  FILTRO_KEYS,
  sanitizeFiltros,
} from "@/lib/validators/lead-view";

describe("sanitizeFiltros — whitelist de params persistíveis", () => {
  it("mantém só as chaves permitidas (descarta page e lixo)", () => {
    expect(
      sanitizeFiltros({
        status: "em_negociacao",
        consultorId: "abc",
        page: "3",
        pageSize: "50",
        qualquerCoisa: "x",
      }),
    ).toEqual({ status: "em_negociacao", consultorId: "abc" });
  });

  it("faz trim e descarta valores vazios", () => {
    expect(sanitizeFiltros({ q: "  ana  ", estado: "", origem: "   " })).toEqual({
      q: "ana",
    });
  });

  it("ignora valores não-string", () => {
    expect(
      sanitizeFiltros({ valorMin: 100 as unknown as string }),
    ).toEqual({});
  });

  it("aceita todas as FILTRO_KEYS conhecidas", () => {
    const entrada = Object.fromEntries(FILTRO_KEYS.map((k) => [k, "v"]));
    expect(Object.keys(sanitizeFiltros(entrada)).sort()).toEqual(
      [...FILTRO_KEYS].sort(),
    );
  });
});

describe("createSavedViewSchema", () => {
  it("aceita entrada válida", () => {
    const r = createSavedViewSchema.safeParse({
      nome: "Alto valor SP",
      viewMode: "kanban",
      filtros: { status: "em_negociacao" },
    });
    expect(r.success).toBe(true);
  });

  it("exige nome não vazio", () => {
    expect(
      createSavedViewSchema.safeParse({
        nome: "   ",
        viewMode: "lista",
        filtros: {},
      }).success,
    ).toBe(false);
  });

  it("rejeita viewMode inválido", () => {
    expect(
      createSavedViewSchema.safeParse({
        nome: "x",
        viewMode: "tabela",
        filtros: {},
      }).success,
    ).toBe(false);
  });

  it("filtros tem default vazio", () => {
    const r = createSavedViewSchema.safeParse({ nome: "x", viewMode: "lista" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.filtros).toEqual({});
  });

  it("limita o tamanho do nome a 60", () => {
    expect(
      createSavedViewSchema.safeParse({
        nome: "a".repeat(61),
        viewMode: "lista",
        filtros: {},
      }).success,
    ).toBe(false);
  });
});
