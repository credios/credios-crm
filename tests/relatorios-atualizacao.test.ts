import { describe, expect, it } from "vitest";

import { janelaRelatorios } from "@/lib/reports/atualizacao";

// Horários em UTC; Brasília = UTC-3.
const em = (iso: string) => janelaRelatorios(new Date(iso));

describe("janela de atualização dos relatórios (9h e 18h de Brasília)", () => {
  it("vira às 9h e às 18h", () => {
    expect(em("2026-10-28T11:59:59Z")).toBe("2026-10-27T18"); // 08:59 BRT
    expect(em("2026-10-28T12:00:00Z")).toBe("2026-10-28T09"); // 09:00 BRT
    expect(em("2026-10-28T20:59:59Z")).toBe("2026-10-28T09"); // 17:59 BRT
    expect(em("2026-10-28T21:00:00Z")).toBe("2026-10-28T18"); // 18:00 BRT
  });

  it("depois da meia-noite segue a janela das 18h do dia anterior", () => {
    expect(em("2026-10-29T02:30:00Z")).toBe("2026-10-28T18"); // 23:30 BRT
    expect(em("2026-10-29T03:30:00Z")).toBe("2026-10-28T18"); // 00:30 BRT
    expect(em("2026-11-01T05:00:00Z")).toBe("2026-10-31T18"); // virada de mês
    expect(em("2027-01-01T05:00:00Z")).toBe("2026-12-31T18"); // virada de ano
  });
});
