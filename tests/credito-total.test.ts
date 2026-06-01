import { describe, expect, it } from "vitest";

import {
  creditoTotalBuscadoCentavos,
  temSaldoDevedor,
} from "@/lib/leads/credito-total";

describe("temSaldoDevedor", () => {
  it("é true quando há saldo devedor positivo", () => {
    expect(temSaldoDevedor(20_000_000)).toBe(true);
  });

  it("é false para null, undefined ou zero (imóvel quitado)", () => {
    expect(temSaldoDevedor(null)).toBe(false);
    expect(temSaldoDevedor(undefined)).toBe(false);
    expect(temSaldoDevedor(0)).toBe(false);
  });
});

describe("creditoTotalBuscadoCentavos", () => {
  it("soma valor buscado + saldo devedor (imóvel financiado)", () => {
    // Cliente quer R$ 350k em mãos, com R$ 200k de saldo a quitar → R$ 550k.
    expect(creditoTotalBuscadoCentavos(35_000_000, 20_000_000)).toBe(55_000_000);
  });

  it("retorna o próprio valor buscado quando não há saldo (quitado)", () => {
    expect(creditoTotalBuscadoCentavos(35_000_000, null)).toBe(35_000_000);
    expect(creditoTotalBuscadoCentavos(35_000_000, 0)).toBe(35_000_000);
  });

  it("retorna null quando não há valor buscado (nada a somar)", () => {
    expect(creditoTotalBuscadoCentavos(null, 20_000_000)).toBeNull();
    expect(creditoTotalBuscadoCentavos(undefined, undefined)).toBeNull();
  });
});
