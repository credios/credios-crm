import { describe, expect, it } from "vitest";

import type { AppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import {
  createAnotacaoSchema,
  updateAnotacaoSchema,
} from "@/lib/validators/anotacao";

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

const lead = (consultorId: string | null) =>
  ({ type: "lead" as const, consultorId });

// ============================================================================
// Permissions
// ============================================================================

describe("checkPermission — lead_anotacao.create", () => {
  it("admin pode criar em qualquer lead", () => {
    expect(
      checkPermission(user({ perfil: "admin" }), "lead_anotacao.create", lead(null)),
    ).toBe(true);
    expect(
      checkPermission(
        user({ perfil: "admin" }),
        "lead_anotacao.create",
        lead("outro-consultor"),
      ),
    ).toBe(true);
  });

  it("consultor pode criar em lead atribuído a ele", () => {
    expect(
      checkPermission(
        user({ perfil: "consultor", id: "u-1" }),
        "lead_anotacao.create",
        lead("u-1"),
      ),
    ).toBe(true);
  });

  it("consultor NÃO pode criar em lead de outro consultor", () => {
    expect(
      checkPermission(
        user({ perfil: "consultor", id: "u-1" }),
        "lead_anotacao.create",
        lead("u-2"),
      ),
    ).toBe(false);
  });

  it("consultor NÃO pode criar em pool (consultorId null)", () => {
    expect(
      checkPermission(
        user({ perfil: "consultor", id: "u-1" }),
        "lead_anotacao.create",
        lead(null),
      ),
    ).toBe(false);
  });

  it("gerente NÃO pode criar (delegado: anotações são do consultor)", () => {
    expect(
      checkPermission(
        user({ perfil: "gerente" }),
        "lead_anotacao.create",
        lead(null),
      ),
    ).toBe(false);
  });

  it("marketing NUNCA pode", () => {
    expect(
      checkPermission(
        user({ perfil: "marketing" }),
        "lead_anotacao.create",
        lead(null),
      ),
    ).toBe(false);
  });

  it("user inativo NÃO pode (defesa)", () => {
    expect(
      checkPermission(
        user({ perfil: "admin", ativo: false }),
        "lead_anotacao.create",
        lead(null),
      ),
    ).toBe(false);
  });
});

describe("checkPermission — lead_anotacao.update (mesma regra de create)", () => {
  it("admin pode", () => {
    expect(
      checkPermission(user({ perfil: "admin" }), "lead_anotacao.update", lead("x")),
    ).toBe(true);
  });
  it("consultor atribuído pode", () => {
    expect(
      checkPermission(
        user({ perfil: "consultor", id: "u-1" }),
        "lead_anotacao.update",
        lead("u-1"),
      ),
    ).toBe(true);
  });
  it("consultor não-atribuído NÃO pode", () => {
    expect(
      checkPermission(
        user({ perfil: "consultor", id: "u-1" }),
        "lead_anotacao.update",
        lead("u-2"),
      ),
    ).toBe(false);
  });
});

describe("checkPermission — lead_anotacao.delete (admin only)", () => {
  it("admin pode", () => {
    expect(
      checkPermission(user({ perfil: "admin" }), "lead_anotacao.delete"),
    ).toBe(true);
  });
  it("gerente NÃO pode", () => {
    expect(
      checkPermission(user({ perfil: "gerente" }), "lead_anotacao.delete"),
    ).toBe(false);
  });
  it("consultor NÃO pode mesmo no lead próprio", () => {
    expect(
      checkPermission(
        user({ perfil: "consultor", id: "u-1" }),
        "lead_anotacao.delete",
        lead("u-1"),
      ),
    ).toBe(false);
  });
});

// ============================================================================
// Zod validators
// ============================================================================

describe("createAnotacaoSchema", () => {
  it("aceita conteúdo simples sem título", () => {
    const r = createAnotacaoSchema.safeParse({ conteudo: "Cliente pediu retorno." });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.titulo).toBeNull();
      expect(r.data.conteudo).toBe("Cliente pediu retorno.");
    }
  });

  it("título vazio vira null", () => {
    const r = createAnotacaoSchema.safeParse({
      titulo: "  ",
      conteudo: "x",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.titulo).toBeNull();
  });

  it("rejeita conteúdo vazio", () => {
    const r = createAnotacaoSchema.safeParse({ conteudo: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita conteúdo só whitespace", () => {
    const r = createAnotacaoSchema.safeParse({ conteudo: "   " });
    expect(r.success).toBe(false);
  });

  it("rejeita conteúdo > 10.000 chars", () => {
    const r = createAnotacaoSchema.safeParse({ conteudo: "x".repeat(10_001) });
    expect(r.success).toBe(false);
  });

  it("rejeita título > 100 chars", () => {
    const r = createAnotacaoSchema.safeParse({
      titulo: "x".repeat(101),
      conteudo: "ok",
    });
    expect(r.success).toBe(false);
  });

  it("limite exato (100/10.000) passa", () => {
    const r = createAnotacaoSchema.safeParse({
      titulo: "x".repeat(100),
      conteudo: "y".repeat(10_000),
    });
    expect(r.success).toBe(true);
  });
});

describe("updateAnotacaoSchema (mesma regra)", () => {
  it("aceita update válido", () => {
    const r = updateAnotacaoSchema.safeParse({
      titulo: "Cônjuge",
      conteudo: "CPF do cônjuge: ...",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita conteúdo vazio em update", () => {
    const r = updateAnotacaoSchema.safeParse({ conteudo: "" });
    expect(r.success).toBe(false);
  });
});
