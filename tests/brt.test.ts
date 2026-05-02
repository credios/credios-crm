import { describe, expect, it } from "vitest";

import { endOfDayBrt, startOfDayBrt, toYmdInBrt } from "@/lib/datetime/brt";

describe("BRT helpers — fuso de negócio (UTC-3)", () => {
  describe("startOfDayBrt", () => {
    it("01:00 BRT = 04:00 UTC para o início do dia", () => {
      // 2026-03-15 00:00 BRT = 2026-03-15 03:00 UTC
      const d = startOfDayBrt("2026-03-15");
      expect(d.toISOString()).toBe("2026-03-15T03:00:00.000Z");
    });

    it("aceita Date (extrai dia BRT)", () => {
      // 2026-03-15 22:00 UTC = 2026-03-15 19:00 BRT (mesmo dia BRT)
      const sourceUtc = new Date("2026-03-15T22:00:00Z");
      const d = startOfDayBrt(sourceUtc);
      expect(d.toISOString()).toBe("2026-03-15T03:00:00.000Z");
    });
  });

  describe("endOfDayBrt", () => {
    it("23:59:59.999 BRT = 02:59:59.999 UTC do dia seguinte", () => {
      const d = endOfDayBrt("2026-03-15");
      expect(d.toISOString()).toBe("2026-03-16T02:59:59.999Z");
    });
  });

  describe("toYmdInBrt", () => {
    it("não desloca quando hora UTC já é hora BRT", () => {
      const d = new Date("2026-03-15T15:00:00Z"); // 12:00 BRT mesmo dia
      expect(toYmdInBrt(d)).toBe("2026-03-15");
    });

    it("ajusta pra dia anterior se hora BRT cai no dia anterior", () => {
      // 02:00 UTC = 23:00 BRT do DIA ANTERIOR
      const d = new Date("2026-03-15T02:00:00Z");
      expect(toYmdInBrt(d)).toBe("2026-03-14");
    });
  });

  describe("regra de janela completa do dia", () => {
    it("fim > início", () => {
      const start = startOfDayBrt("2026-03-15");
      const end = endOfDayBrt("2026-03-15");
      expect(end.getTime()).toBeGreaterThan(start.getTime());
      // ~24h - 1ms
      expect(end.getTime() - start.getTime()).toBe(86400000 - 1);
    });

    it("um lead criado às 23:00 BRT do dia 15 está DENTRO da janela do dia 15", () => {
      // Antes (UTC): a janela era 15T00Z–15T23:59Z, e 23:00 BRT = 02:00 UTC do dia 16,
      // então o lead caía FORA da janela errôneamente. Agora cai dentro.
      const start = startOfDayBrt("2026-03-15");
      const end = endOfDayBrt("2026-03-15");
      const leadCreated = new Date("2026-03-16T02:00:00Z"); // = 23:00 BRT 15/3
      expect(leadCreated.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(leadCreated.getTime()).toBeLessThanOrEqual(end.getTime());
    });
  });
});
