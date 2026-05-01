import { describe, expect, it, vi } from "vitest";

import { matchesConditions } from "@/lib/routing/conditions";
import { aplicarRoteamento } from "@/lib/routing/engine";
import { __computeNextForTest as computeNext } from "@/lib/routing/round-robin";
import type {
  RoutingContext,
  RoutingDeps,
  RoutingRule,
} from "@/lib/routing/types";

const baseCtx: RoutingContext = {
  valorCreditoCentavos: 30_000_000, // R$ 300k
  valorImovelCentavos: 80_000_000, // R$ 800k
  estado: "SC",
  origem: "Google",
  tipoImovel: "Casa",
  horarioComercial: true,
};

function rule(overrides: Partial<RoutingRule>): RoutingRule {
  return {
    id: "r-id",
    nome: "Regra teste",
    ativa: true,
    prioridade: 0,
    condicoes: {},
    acao: "pool_nao_atribuido",
    parametros: null,
    ...overrides,
  };
}

function makeDeps(
  rules: RoutingRule[],
  picker?: RoutingDeps["pickNextRoundRobin"],
): RoutingDeps {
  return {
    listActiveRules: async () => rules,
    pickNextRoundRobin: picker ?? (async (_id, grupo) => grupo[0]),
  };
}

describe("matchesConditions", () => {
  it("vazio bate sempre", () => {
    expect(matchesConditions(baseCtx, {})).toBe(true);
  });

  it("valor_credito_min: bate quando >= min", () => {
    expect(matchesConditions(baseCtx, { valor_credito_min: 30_000_000 })).toBe(true);
    expect(matchesConditions(baseCtx, { valor_credito_min: 30_000_001 })).toBe(false);
  });

  it("valor_credito_max: bate quando <= max", () => {
    expect(matchesConditions(baseCtx, { valor_credito_max: 30_000_000 })).toBe(true);
    expect(matchesConditions(baseCtx, { valor_credito_max: 29_999_999 })).toBe(false);
  });

  it("valor null no lead nunca bate min/max", () => {
    const ctx = { ...baseCtx, valorCreditoCentavos: null };
    expect(matchesConditions(ctx, { valor_credito_min: 1 })).toBe(false);
    expect(matchesConditions(ctx, { valor_credito_max: 1_000_000_000 })).toBe(false);
  });

  it("estado_in: case-sensitive (UF maiúscula)", () => {
    expect(matchesConditions(baseCtx, { estado_in: ["SC", "PR"] })).toBe(true);
    expect(matchesConditions(baseCtx, { estado_in: ["RJ", "SP"] })).toBe(false);
    expect(matchesConditions({ ...baseCtx, estado: null }, { estado_in: ["SC"] })).toBe(false);
  });

  it("origem_in e tipo_imovel_in", () => {
    expect(matchesConditions(baseCtx, { origem_in: ["Google", "Indicação"] })).toBe(true);
    expect(matchesConditions(baseCtx, { origem_in: ["YouTube"] })).toBe(false);
    expect(matchesConditions(baseCtx, { tipo_imovel_in: ["Casa", "Apartamento"] })).toBe(true);
    expect(matchesConditions(baseCtx, { tipo_imovel_in: ["Comercial"] })).toBe(false);
  });

  it("horario_comercial: bate apenas quando o estado computado coincide", () => {
    expect(matchesConditions({ ...baseCtx, horarioComercial: true }, { horario_comercial: true })).toBe(true);
    expect(matchesConditions({ ...baseCtx, horarioComercial: true }, { horario_comercial: false })).toBe(false);
    expect(matchesConditions({ ...baseCtx, horarioComercial: false }, { horario_comercial: false })).toBe(true);
  });

  it("AND: todas as condições devem bater", () => {
    expect(
      matchesConditions(baseCtx, {
        valor_credito_min: 10_000_000,
        estado_in: ["SC"],
        origem_in: ["Google"],
      }),
    ).toBe(true);
    expect(
      matchesConditions(baseCtx, {
        valor_credito_min: 10_000_000,
        estado_in: ["RJ"], // não bate
      }),
    ).toBe(false);
  });
});

describe("computeNext (round-robin pure function)", () => {
  it("sem ultimo → primeiro do grupo", () => {
    expect(computeNext(null, ["a", "b", "c"])).toBe("a");
  });

  it("ciclo: a→b→c→a", () => {
    expect(computeNext("a", ["a", "b", "c"])).toBe("b");
    expect(computeNext("b", ["a", "b", "c"])).toBe("c");
    expect(computeNext("c", ["a", "b", "c"])).toBe("a");
  });

  it("ultimo fora do grupo → cai no primeiro", () => {
    expect(computeNext("x", ["a", "b"])).toBe("a");
  });

  it("grupo de 1 sempre devolve o mesmo", () => {
    expect(computeNext(null, ["a"])).toBe("a");
    expect(computeNext("a", ["a"])).toBe("a");
  });

  it("grupo vazio lança", () => {
    expect(() => computeNext(null, [])).toThrow();
  });
});

describe("aplicarRoteamento", () => {
  it("sem regras → pool_default", async () => {
    const result = await aplicarRoteamento(baseCtx, makeDeps([]));
    expect(result).toEqual({
      consultorId: null,
      regraAplicada: "pool_default",
      regraId: null,
    });
  });

  it("regra match → atribuir_usuario", async () => {
    const result = await aplicarRoteamento(
      baseCtx,
      makeDeps([
        rule({
          id: "r1",
          nome: "Alta renda → Gabriel",
          prioridade: 100,
          condicoes: { valor_credito_min: 10_000_000 },
          acao: "atribuir_usuario",
          parametros: { usuario_id: "gabriel-uuid" },
        }),
      ]),
    );
    expect(result).toEqual({
      consultorId: "gabriel-uuid",
      regraAplicada: "Alta renda → Gabriel",
      regraId: "r1",
    });
  });

  it("regra não-match → pool_default", async () => {
    const result = await aplicarRoteamento(
      baseCtx,
      makeDeps([
        rule({
          condicoes: { valor_credito_min: 100_000_000_000 },
          acao: "atribuir_usuario",
          parametros: { usuario_id: "x" },
        }),
      ]),
    );
    expect(result.consultorId).toBeNull();
    expect(result.regraAplicada).toBe("pool_default");
  });

  it("respeita ordem de prioridade (primeiro match na lista vence)", async () => {
    const rules = [
      rule({
        id: "high",
        nome: "Alta",
        prioridade: 100,
        condicoes: { valor_credito_min: 20_000_000 },
        acao: "atribuir_usuario",
        parametros: { usuario_id: "alice" },
      }),
      rule({
        id: "low",
        nome: "Baixa fallback",
        prioridade: 1,
        condicoes: {},
        acao: "atribuir_usuario",
        parametros: { usuario_id: "bob" },
      }),
    ];
    // Engine assume que rules vêm já ordenadas por prioridade desc (deps cuida disso).
    const result = await aplicarRoteamento(baseCtx, makeDeps(rules));
    expect(result.consultorId).toBe("alice");
  });

  it("ativa=false é ignorado mesmo se vier no array", async () => {
    const result = await aplicarRoteamento(
      baseCtx,
      makeDeps([
        rule({
          ativa: false,
          condicoes: {},
          acao: "atribuir_usuario",
          parametros: { usuario_id: "should-not-pick" },
        }),
      ]),
    );
    expect(result.regraAplicada).toBe("pool_default");
  });

  it("round_robin_grupo chama deps.pickNextRoundRobin com regraId e grupo", async () => {
    const picker = vi.fn<RoutingDeps["pickNextRoundRobin"]>(
      async (_regraId, grupo) => grupo[1],
    );
    const result = await aplicarRoteamento(
      baseCtx,
      makeDeps(
        [
          rule({
            id: "rr1",
            nome: "RR",
            condicoes: {},
            acao: "round_robin_grupo",
            parametros: { grupo_usuarios: ["u1", "u2", "u3"] },
          }),
        ],
        picker,
      ),
    );
    expect(picker).toHaveBeenCalledWith("rr1", ["u1", "u2", "u3"], undefined);
    expect(result.consultorId).toBe("u2");
  });

  it("round_robin_grupo com grupo vazio cai pro pool", async () => {
    const result = await aplicarRoteamento(
      baseCtx,
      makeDeps([
        rule({
          condicoes: {},
          acao: "round_robin_grupo",
          parametros: { grupo_usuarios: [] },
        }),
      ]),
    );
    expect(result.consultorId).toBeNull();
    expect(result.regraAplicada).toBe("pool_default");
  });

  it("pool_nao_atribuido explícito retorna null mas atribui regraAplicada", async () => {
    const result = await aplicarRoteamento(
      baseCtx,
      makeDeps([
        rule({
          id: "pool",
          nome: "Pool explícito",
          condicoes: {},
          acao: "pool_nao_atribuido",
          parametros: null,
        }),
      ]),
    );
    expect(result.consultorId).toBeNull();
    expect(result.regraAplicada).toBe("Pool explícito");
    expect(result.regraId).toBe("pool");
  });

  it("dryRun é repassado pra deps.pickNextRoundRobin", async () => {
    const picker = vi.fn<RoutingDeps["pickNextRoundRobin"]>(
      async (_id, grupo) => grupo[0],
    );
    await aplicarRoteamento(
      baseCtx,
      makeDeps(
        [
          rule({
            condicoes: {},
            acao: "round_robin_grupo",
            parametros: { grupo_usuarios: ["a", "b"] },
          }),
        ],
        picker,
      ),
      { dryRun: true },
    );
    expect(picker).toHaveBeenCalledWith("r-id", ["a", "b"], { dryRun: true });
  });
});
