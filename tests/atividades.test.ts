import { describe, expect, it } from "vitest";

import type { AppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import {
  atividadesFiltersSchema,
  resolveConsultor,
  resolveDateRange,
  resolveTipos,
} from "@/lib/atividades/filters";
import { computeKpis } from "@/lib/atividades/query";
import type { Atividade } from "@/lib/atividades/types";

function user(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user-1",
    email: "u@credios.com",
    nome: "User",
    perfil: "admin",
    ativo: true,
    whatsapp: null,
    ...overrides,
  } as AppUser;
}

// ============================================================================
// Permissions
// ============================================================================

describe("checkPermission — admin.view_activities", () => {
  it("admin pode", () => {
    expect(
      checkPermission(user({ perfil: "admin" }), "admin.view_activities"),
    ).toBe(true);
  });
  it("gerente pode (regra confirmada pelo owner)", () => {
    expect(
      checkPermission(user({ perfil: "gerente" }), "admin.view_activities"),
    ).toBe(true);
  });
  it("consultor NÃO pode", () => {
    expect(
      checkPermission(user({ perfil: "consultor" }), "admin.view_activities"),
    ).toBe(false);
  });
  it("marketing NÃO pode", () => {
    expect(
      checkPermission(user({ perfil: "marketing" }), "admin.view_activities"),
    ).toBe(false);
  });
  it("user inativo NÃO pode", () => {
    expect(
      checkPermission(
        user({ perfil: "admin", ativo: false }),
        "admin.view_activities",
      ),
    ).toBe(false);
  });
});

// ============================================================================
// Zod filters schema
// ============================================================================

describe("atividadesFiltersSchema", () => {
  it("default periodo = hoje", () => {
    const r = atividadesFiltersSchema.parse({});
    expect(r.periodo).toBe("hoje");
  });

  it("aceita periodo válido", () => {
    const r = atividadesFiltersSchema.parse({ periodo: "30d" });
    expect(r.periodo).toBe("30d");
  });

  it("rejeita periodo inválido", () => {
    const r = atividadesFiltersSchema.safeParse({ periodo: "trimestre" });
    expect(r.success).toBe(false);
  });

  it("aceita datas no formato YYYY-MM-DD", () => {
    const r = atividadesFiltersSchema.parse({
      periodo: "personalizado",
      dataDe: "2026-05-01",
      dataAte: "2026-05-31",
    });
    expect(r.dataDe).toBe("2026-05-01");
  });

  it("rejeita datas em formato errado", () => {
    const r = atividadesFiltersSchema.safeParse({
      periodo: "personalizado",
      dataDe: "01/05/2026",
    });
    expect(r.success).toBe(false);
  });
});

// ============================================================================
// resolveDateRange
// ============================================================================

describe("resolveDateRange", () => {
  it("hoje: from = início do dia, to = fim do dia", () => {
    const { from, to } = resolveDateRange({ periodo: "hoje" });
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(from.toDateString()).toBe(to.toDateString());
  });

  it("ontem: from e to são do dia anterior", () => {
    const { from } = resolveDateRange({ periodo: "ontem" });
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    expect(from.toDateString()).toBe(ontem.toDateString());
  });

  it("30d: from é 29 dias antes (hoje incluso) — 30 dias de range total", () => {
    const { from, to } = resolveDateRange({ periodo: "30d" });
    // diferença em dias inteiros entre datas (ignora horas) deve ser 29
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const diffDays = Math.round(
      (toDay.getTime() - fromDay.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(29);
  });

  it("personalizado: usa dataDe e dataAte fornecidos", () => {
    const { from, to } = resolveDateRange({
      periodo: "personalizado",
      dataDe: "2026-05-01",
      dataAte: "2026-05-31",
    });
    expect(from.getMonth()).toBe(4); // maio = 4
    expect(from.getDate()).toBe(1);
    expect(to.getMonth()).toBe(4);
    expect(to.getDate()).toBe(31);
  });
});

// ============================================================================
// resolveTipos / resolveConsultor
// ============================================================================

describe("resolveTipos", () => {
  it("__all__ ou ausente → null (sem filtro)", () => {
    expect(resolveTipos({ periodo: "hoje", tipo: "__all__" })).toBeNull();
    expect(resolveTipos({ periodo: "hoje" })).toBeNull();
  });
  it("tipo específico → array de 1", () => {
    expect(resolveTipos({ periodo: "hoje", tipo: "whatsapp" })).toEqual(["whatsapp"]);
  });
});

describe("resolveConsultor", () => {
  it("__all__ ou ausente → null", () => {
    expect(
      resolveConsultor({ periodo: "hoje", consultorId: "__all__" }),
    ).toBeNull();
    expect(resolveConsultor({ periodo: "hoje" })).toBeNull();
  });
  it("UUID → retorna UUID", () => {
    expect(resolveConsultor({ periodo: "hoje", consultorId: "abc" })).toBe("abc");
  });
});

// ============================================================================
// computeKpis
// ============================================================================

function ativ(overrides: Partial<Atividade> = {}): Atividade {
  return {
    id: "a:1",
    source: "anotacao",
    tipo: "whatsapp",
    hora: new Date().toISOString(),
    consultor: { id: "c-1", nome: "Rodrigo" },
    lead: { id: "l-1", nome: "Ana", status: "novo" },
    titulo: null,
    detalhe: "x",
    ...overrides,
  };
}

describe("computeKpis", () => {
  it("array vazio → array vazio", () => {
    expect(computeKpis([])).toEqual([]);
  });

  it("agrega total por consultor", () => {
    const r = computeKpis([
      ativ({ consultor: { id: "c-1", nome: "Rodrigo" } }),
      ativ({ consultor: { id: "c-1", nome: "Rodrigo" } }),
      ativ({ consultor: { id: "c-2", nome: "Gabriel" } }),
    ]);
    expect(r).toHaveLength(2);
    const rodrigo = r.find((k) => k.consultorId === "c-1");
    expect(rodrigo?.total).toBe(2);
    const gabriel = r.find((k) => k.consultorId === "c-2");
    expect(gabriel?.total).toBe(1);
  });

  it("agrega total por tipo dentro de cada consultor", () => {
    const r = computeKpis([
      ativ({ tipo: "whatsapp" }),
      ativ({ tipo: "whatsapp" }),
      ativ({ tipo: "ligacao" }),
      ativ({ tipo: "anotacao" }),
    ]);
    const kpi = r[0]!;
    expect(kpi.porTipo.whatsapp).toBe(2);
    expect(kpi.porTipo.ligacao).toBe(1);
    expect(kpi.porTipo.anotacao).toBe(1);
  });

  it("ordena por total desc (consultor mais ativo primeiro)", () => {
    const r = computeKpis([
      ativ({ consultor: { id: "c-1", nome: "A" } }),
      ativ({ consultor: { id: "c-2", nome: "B" } }),
      ativ({ consultor: { id: "c-2", nome: "B" } }),
      ativ({ consultor: { id: "c-2", nome: "B" } }),
    ]);
    expect(r[0]?.consultorId).toBe("c-2");
    expect(r[0]?.total).toBe(3);
    expect(r[1]?.consultorId).toBe("c-1");
  });
});
