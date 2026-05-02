import { describe, expect, it } from "vitest";

import {
  endOfBusinessDayBrt,
  isBusinessDayBrt,
  todayYmdBrt,
} from "@/lib/datetime/brt";
import { completeTaskSchema } from "@/lib/validators/task";

describe("task validation", () => {
  it("exige observação quando ação é Outro", () => {
    expect(completeTaskSchema.safeParse({ acao: "outro" }).success).toBe(false);
    expect(
      completeTaskSchema.safeParse({ acao: "outro", observacao: "Cliente pediu contexto específico" }).success,
    ).toBe(true);
  });

  it("aceita ações padrão sem observação", () => {
    expect(completeTaskSchema.safeParse({ acao: "enviei_whatsapp" }).success).toBe(true);
    expect(completeTaskSchema.safeParse({ acao: "nao_consegui_contato" }).success).toBe(true);
  });
});

describe("BRT task scheduling", () => {
  it("gera data de referência em BRT", () => {
    const utcLate = new Date("2026-05-02T02:30:00.000Z"); // 2026-05-01 23:30 BRT
    expect(todayYmdBrt(utcLate)).toBe("2026-05-01");
  });

  it("reconhece dias úteis no BRT", () => {
    expect(isBusinessDayBrt(new Date("2026-05-01T15:00:00.000Z"))).toBe(true);
    expect(isBusinessDayBrt(new Date("2026-05-02T15:00:00.000Z"))).toBe(false);
  });

  it("vence às 18h BRT", () => {
    expect(endOfBusinessDayBrt("2026-05-01").toISOString()).toBe(
      "2026-05-01T21:00:00.000Z",
    );
  });
});
