import { describe, expect, it } from "vitest";

import { safeNext } from "@/lib/auth/safe-next";

describe("safeNext — bloqueia open redirect", () => {
  describe("rejeita (vira fallback /minha-mesa)", () => {
    const cases: Array<[string | null | undefined, string]> = [
      [null, "null"],
      [undefined, "undefined"],
      ["", "string vazia"],
      ["   ", "só whitespace"],
      ["//evil.com", "protocol-relative dupla barra"],
      ["//evil.com/foo", "protocol-relative com path"],
      ["http://evil.com", "absoluto http"],
      ["https://evil.com", "absoluto https"],
      ["http://evil.com/leads", "absoluto fingindo path interno"],
      ["javascript:alert(1)", "scheme javascript"],
      ["JavaScript:alert(1)", "scheme javascript case mix"],
      ["data:text/html,<script>", "scheme data"],
      ["\\\\evil.com", "backslashes (Windows path)"],
      ["evil.com", "sem protocolo nem /"],
      ["leads", "path relativo sem barra"],
    ];

    for (const [input, label] of cases) {
      it(`rejeita: ${label}`, () => {
        expect(safeNext(input)).toBe("/minha-mesa");
      });
    }
  });

  describe("aceita paths internos", () => {
    const cases: Array<[string, string]> = [
      ["/leads", "/leads"],
      ["/leads/abc-123", "/leads/abc-123"],
      ["/relatorios?periodo=30d", "/relatorios?periodo=30d"],
      ["/admin/painel-executivo", "/admin/painel-executivo"],
      ["/leads#anchor", "/leads#anchor"],
      [
        "/relatorios?a=1&b=2#section",
        "/relatorios?a=1&b=2#section",
      ],
    ];

    for (const [input, expected] of cases) {
      it(`aceita: ${input}`, () => {
        expect(safeNext(input)).toBe(expected);
      });
    }
  });

  it("aplica fallback custom", () => {
    expect(safeNext(undefined, "/perfil")).toBe("/perfil");
    expect(safeNext("//evil.com", "/perfil")).toBe("/perfil");
  });

  it("normaliza backslash dentro de path pra evitar trick", () => {
    // URL parser normaliza \ → / dentro do path. Resultado deve ficar no
    // origin local (não escapa pra evil.com).
    const out = safeNext("/foo\\@evil.com");
    // Aceita normalizado dentro do origin (qualquer path/* serve).
    expect(out.startsWith("/")).toBe(true);
    expect(out.includes("//")).toBe(false);
  });
});
