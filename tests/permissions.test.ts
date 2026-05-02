import { describe, expect, it } from "vitest";

import type { AppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";

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

describe("checkPermission — lead.close_or_reopen (admin only)", () => {
  it("admin pode", () => {
    expect(checkPermission(user({ perfil: "admin" }), "lead.close_or_reopen")).toBe(true);
  });

  it("gerente NÃO pode", () => {
    expect(checkPermission(user({ perfil: "gerente" }), "lead.close_or_reopen")).toBe(false);
  });

  it("consultor NÃO pode", () => {
    expect(checkPermission(user({ perfil: "consultor" }), "lead.close_or_reopen")).toBe(false);
  });

  it("marketing NÃO pode", () => {
    expect(checkPermission(user({ perfil: "marketing" }), "lead.close_or_reopen")).toBe(false);
  });

  it("user inativo nunca pode", () => {
    expect(
      checkPermission(user({ perfil: "admin", ativo: false }), "lead.close_or_reopen"),
    ).toBe(false);
  });

  it("user null nunca pode", () => {
    expect(checkPermission(null, "lead.close_or_reopen")).toBe(false);
  });
});

describe("checkPermission — lead.read_financial (admin only)", () => {
  it("admin pode", () => {
    expect(checkPermission(user({ perfil: "admin" }), "lead.read_financial")).toBe(true);
  });

  for (const perfil of ["gerente", "consultor", "marketing"] as const) {
    it(`${perfil} NÃO pode`, () => {
      expect(checkPermission(user({ perfil }), "lead.read_financial")).toBe(false);
    });
  }
});

describe("checkPermission — lead.read (consultor scope)", () => {
  const ownerId = "user-1";
  const otherId = "other";

  it("admin lê qualquer lead", () => {
    expect(
      checkPermission(user({ perfil: "admin" }), "lead.read", {
        type: "lead",
        consultorId: otherId,
      }),
    ).toBe(true);
  });

  it("gerente lê qualquer lead", () => {
    expect(
      checkPermission(user({ perfil: "gerente" }), "lead.read", {
        type: "lead",
        consultorId: otherId,
      }),
    ).toBe(true);
  });

  it("marketing lê qualquer lead", () => {
    expect(
      checkPermission(user({ perfil: "marketing" }), "lead.read", {
        type: "lead",
        consultorId: otherId,
      }),
    ).toBe(true);
  });

  it("consultor lê próprio lead", () => {
    expect(
      checkPermission(user({ perfil: "consultor", id: ownerId }), "lead.read", {
        type: "lead",
        consultorId: ownerId,
      }),
    ).toBe(true);
  });

  it("consultor NÃO lê lead de outro", () => {
    expect(
      checkPermission(user({ perfil: "consultor", id: ownerId }), "lead.read", {
        type: "lead",
        consultorId: otherId,
      }),
    ).toBe(false);
  });

  it("consultor sem resource definido = false", () => {
    expect(checkPermission(user({ perfil: "consultor" }), "lead.read")).toBe(false);
  });
});
