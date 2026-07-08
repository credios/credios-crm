import { describe, expect, it } from "vitest";

import { valorCreditoRedondo } from "@/lib/templates";

describe("valorCreditoRedondo", () => {
  it("arredonda pro passo de 50 mil abaixo de 1M", () => {
    expect(valorCreditoRedondo(48_000_000)).toBe("R$ 500 mil"); // 480k
    expect(valorCreditoRedondo(62_000_000)).toBe("R$ 600 mil"); // 620k
    expect(valorCreditoRedondo(60_000_000)).toBe("R$ 600 mil"); // 600k exato
    expect(valorCreditoRedondo(13_000_000)).toBe("R$ 150 mil"); // 130k
    expect(valorCreditoRedondo(27_400_000)).toBe("R$ 250 mil"); // 274k
  });

  it("valores pequenos sobem pro piso de 100 mil", () => {
    expect(valorCreditoRedondo(6_000_000)).toBe("R$ 100 mil"); // 60k
  });

  it("acima de 1M vira milhão com 1 casa", () => {
    expect(valorCreditoRedondo(135_000_000)).toBe("R$ 1,4 milhão"); // 1,35M
    expect(valorCreditoRedondo(100_000_000)).toBe("R$ 1 milhão");
    expect(valorCreditoRedondo(200_000_000)).toBe("R$ 2 milhões");
    expect(valorCreditoRedondo(98_000_000)).toBe("R$ 1 milhão"); // 980k → 1M
  });

  it("sem valor cai no genérico", () => {
    expect(valorCreditoRedondo(null)).toBe("R$ 500 mil");
  });
});
