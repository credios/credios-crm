import { describe, expect, it } from "vitest";

import {
  FUNIL_MIN_CREDITO_CENTAVOS,
  FUNIL_MIN_IMOVEL_CENTAVOS,
  FUNIL_MIN_RENDA_COM_CONJUGE_CENTAVOS,
  FUNIL_MIN_RENDA_TITULAR_CENTAVOS,
  LTV_MAX,
  REUNIAO_MIN_CREDITO_CENTAVOS,
  SALDO_MAX_RATIO,
  SCORE_MINIMO_REUNIAO,
  rendaQualificaCentavos,
  saldoForaDaPolitica,
} from "@/lib/politica-credito";

// A política central é ESPELHADA no site (src/lib/qualificacao.ts do repo
// credios-website-v2). Estes testes travam os valores: mudou a política,
// muda aqui + lá, de propósito — nunca por acidente.

describe("valores da política (unificação 09/07/2026)", () => {
  it("nível funil: imóvel 300k, crédito 75k, renda 5k/8k, saldo < 50%", () => {
    expect(FUNIL_MIN_IMOVEL_CENTAVOS).toBe(30_000_000);
    expect(FUNIL_MIN_CREDITO_CENTAVOS).toBe(7_500_000);
    expect(FUNIL_MIN_RENDA_TITULAR_CENTAVOS).toBe(500_000);
    expect(FUNIL_MIN_RENDA_COM_CONJUGE_CENTAVOS).toBe(800_000);
    expect(SALDO_MAX_RATIO).toBe(0.5);
  });

  it("nível reunião: crédito 100k, LTV 60%, score 650", () => {
    expect(REUNIAO_MIN_CREDITO_CENTAVOS).toBe(10_000_000);
    expect(LTV_MAX).toBe(0.6);
    expect(SCORE_MINIMO_REUNIAO).toBe(650);
  });
});

describe("rendaQualificaCentavos", () => {
  it("titular no piso passa sozinho; abaixo não", () => {
    expect(rendaQualificaCentavos(500_000)).toBe(true);
    expect(rendaQualificaCentavos(499_900)).toBe(false);
  });

  it("composição: soma ≥ 8k passa; soma menor ou cônjuge zerado não", () => {
    expect(rendaQualificaCentavos(400_000, 400_000)).toBe(true); // 8k cravado
    expect(rendaQualificaCentavos(300_000, 490_000)).toBe(false); // 7,9k
    expect(rendaQualificaCentavos(400_000, 0)).toBe(false);
  });
});

describe("saldoForaDaPolitica", () => {
  it("50% ou mais do imóvel está fora; abaixo não; sem valor de imóvel não avalia", () => {
    expect(saldoForaDaPolitica(50_000_000, 100_000_000)).toBe(true);
    expect(saldoForaDaPolitica(49_900_000, 100_000_000)).toBe(false);
    expect(saldoForaDaPolitica(10_000_000, 0)).toBe(false);
  });
});
