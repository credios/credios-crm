import { describe, expect, it } from "vitest";

import { fmtDateTime } from "@/lib/google-ads/format";
import {
  closedValueCents,
  qualifiedValueCents,
  QUALIFIED_CLOSE_RATE,
  SUCCESS_FEE_PCT,
  TICKET_MEDIO_CENTAVOS,
} from "@/lib/google-ads/value";

describe("google-ads fmtDateTime", () => {
  it("formata em America/Sao_Paulo com offset -03:00", () => {
    // 2026-06-26T12:00:00Z → 09:00 em São Paulo (-03:00).
    const out = fmtDateTime(new Date("2026-06-26T12:00:00.000Z"));
    expect(out).toBe("2026-06-26 09:00:00-03:00");
  });

  it("vira o dia corretamente perto da meia-noite UTC", () => {
    // 2026-06-26T01:30:00Z → 22:30 do dia 25 em São Paulo.
    const out = fmtDateTime(new Date("2026-06-26T01:30:00.000Z"));
    expect(out).toBe("2026-06-25 22:30:00-03:00");
  });
});

describe("google-ads value model", () => {
  it("qualified = crédito × success fee × taxa de fechamento", () => {
    const credito = 500_000_00; // R$ 500.000
    expect(qualifiedValueCents(credito)).toBe(
      Math.round(credito * SUCCESS_FEE_PCT * QUALIFIED_CLOSE_RATE),
    );
  });

  it("qualified cai pro ticket médio quando crédito é nulo/zero", () => {
    const expected = Math.round(
      TICKET_MEDIO_CENTAVOS * SUCCESS_FEE_PCT * QUALIFIED_CLOSE_RATE,
    );
    expect(qualifiedValueCents(null)).toBe(expected);
    expect(qualifiedValueCents(0)).toBe(expected);
  });

  it("closed usa a comissão real quando disponível", () => {
    expect(
      closedValueCents({
        comissaoCentavos: 12_345_00,
        valorLiberadoCentavos: 999_999_00,
        valorCreditoCentavos: 888_888_00,
      }),
    ).toBe(12_345_00);
  });

  it("closed estima a partir do valor liberado quando não há comissão", () => {
    const liberado = 300_000_00;
    expect(
      closedValueCents({
        comissaoCentavos: null,
        valorLiberadoCentavos: liberado,
        valorCreditoCentavos: null,
      }),
    ).toBe(Math.round(liberado * SUCCESS_FEE_PCT));
  });
});
