import { describe, expect, it } from "vitest";

import { escolherVariados } from "@/lib/calendar/disponibilidade";

// Constrói um slot de 30 min a partir de um horário BRT ("2026-07-01T08:00").
function slot(brt: string) {
  const inicio = new Date(`${brt}:00-03:00`);
  return { inicio, fim: new Date(inicio.getTime() + 30 * 60_000) };
}
const hhBrt = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
const periodo = (d: Date) => (Number(hhBrt(d).slice(0, 2)) < 12 ? "AM" : "PM");

describe("escolherVariados", () => {
  it("não amontoa: cobre manhã E tarde em vez de pegar só os primeiros", () => {
    // Só de manhã disponível: 08:00, 08:30, 09:00, 10:00; e à tarde: 14:00, 16:00, 17:30.
    const free = [
      "2026-07-01T08:00",
      "2026-07-01T08:30",
      "2026-07-01T09:00",
      "2026-07-01T10:00",
      "2026-07-01T14:00",
      "2026-07-01T16:00",
      "2026-07-01T17:30",
      "2026-07-02T08:00",
      "2026-07-02T09:00",
    ].map(slot);

    const r = escolherVariados(free, 3);
    expect(r).toHaveLength(3);
    // Deve haver manhã E tarde (não 3 da manhã).
    const periodos = new Set(r.map((s) => periodo(s.inicio)));
    expect(periodos.has("AM")).toBe(true);
    expect(periodos.has("PM")).toBe(true);
    // Tarde pega o mais tarde do dia (espalha): 17:30 presente.
    expect(r.some((s) => hhBrt(s.inicio) === "17:30")).toBe(true);
    // Cronológico.
    expect(r.map((s) => s.inicio.getTime())).toEqual(
      [...r.map((s) => s.inicio.getTime())].sort((a, b) => a - b),
    );
  });

  it("um dia só, poucos períodos → completa com horários distantes (≥90min)", () => {
    const free = ["2026-07-01T08:00", "2026-07-01T09:00", "2026-07-01T10:00", "2026-07-01T13:00"].map(
      slot,
    );
    const r = escolherVariados(free, 3);
    expect(r).toHaveLength(3);
    // Nenhum par com menos de 90 min de distância.
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const diff = Math.abs(r[i]!.inicio.getTime() - r[j]!.inicio.getTime()) / 60_000;
        expect(diff).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it("respeita o max e não quebra com lista curta", () => {
    expect(escolherVariados([slot("2026-07-01T08:00")], 3)).toHaveLength(1);
    expect(escolherVariados([], 3)).toHaveLength(0);
  });
});
