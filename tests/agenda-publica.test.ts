import { describe, expect, it } from "vitest";

import {
  AGENDA_CONSULTOR_ALTO,
  AGENDA_CONSULTOR_PADRAO,
  consultorAgendaEmail,
  elegivelAgendaPublica,
} from "@/lib/agenda/prequal";
import { candidatosDoDia } from "@/lib/agenda/slots";
import { gerarAgendaToken, validarAgendaToken } from "@/lib/agenda/token";

// Lead que passa em tudo: crédito 200k, imóvel 800k, renda 10k, apartamento.
const base = {
  valorCreditoCentavos: 20_000_000,
  valorImovelCentavos: 80_000_000,
  rendaMensalCentavos: 1_000_000,
  tipoImovel: "Apartamento",
};

describe("elegivelAgendaPublica", () => {
  it("aprova o lead que passa em todos os critérios", () => {
    expect(elegivelAgendaPublica(base)).toBe(true);
  });

  it("piso de crédito: 100k passa, 99k não", () => {
    expect(elegivelAgendaPublica({ ...base, valorCreditoCentavos: 10_000_000 })).toBe(true);
    expect(elegivelAgendaPublica({ ...base, valorCreditoCentavos: 9_900_000 })).toBe(false);
  });

  it("piso do imóvel: 300k passa, 299k não", () => {
    expect(elegivelAgendaPublica({ ...base, valorImovelCentavos: 30_000_000 })).toBe(true);
    expect(elegivelAgendaPublica({ ...base, valorImovelCentavos: 29_900_000 })).toBe(false);
  });

  it("piso de renda: 6k passa, 5.9k não; renda ausente não passa", () => {
    expect(elegivelAgendaPublica({ ...base, rendaMensalCentavos: 600_000 })).toBe(true);
    expect(elegivelAgendaPublica({ ...base, rendaMensalCentavos: 590_000 })).toBe(false);
    expect(elegivelAgendaPublica({ ...base, rendaMensalCentavos: null })).toBe(false);
  });

  it("tipos aceitos (com/sem acento e caixa); demais tipos não", () => {
    for (const t of ["Apartamento", "Casa de condomínio", "casa de condominio", "CASA DE RUA"]) {
      expect(elegivelAgendaPublica({ ...base, tipoImovel: t })).toBe(true);
    }
    for (const t of ["Terreno", "Outro", "Sala comercial", "Galpão", "Casa", null]) {
      expect(elegivelAgendaPublica({ ...base, tipoImovel: t })).toBe(false);
    }
  });
});

describe("consultorAgendaEmail", () => {
  it("acima de 500k → Gabriel; 500k ou menos → Rodrigo", () => {
    expect(consultorAgendaEmail(50_000_001)).toBe(AGENDA_CONSULTOR_ALTO);
    expect(consultorAgendaEmail(50_000_000)).toBe(AGENDA_CONSULTOR_PADRAO);
    expect(consultorAgendaEmail(10_000_000)).toBe(AGENDA_CONSULTOR_PADRAO);
  });
});

describe("agenda token", () => {
  it("round-trip válido", () => {
    process.env.AGENDA_TOKEN_SECRET = "teste-secreto";
    const t = gerarAgendaToken("lead-123");
    expect(validarAgendaToken(t)).toBe("lead-123");
  });

  it("rejeita assinatura adulterada e token expirado", () => {
    process.env.AGENDA_TOKEN_SECRET = "teste-secreto";
    const t = gerarAgendaToken("lead-123");
    expect(validarAgendaToken(t.slice(0, -2) + "xx")).toBeNull();
    const vencido = gerarAgendaToken("lead-123", -1); // TTL negativo → já expirou
    expect(validarAgendaToken(vencido)).toBeNull();
    expect(validarAgendaToken("lixo")).toBeNull();
  });
});

describe("grade de candidatos (08:00–19:30, passo 15)", () => {
  const YMD = "2026-07-07"; // terça
  const inicioDia = new Date(`${YMD}T00:00:00-03:00`).getTime();

  it("sem corte de antecedência: 47 inícios, do 08:00 ao 19:30", () => {
    const c = candidatosDoDia(YMD, 0);
    expect(c.length).toBe(47); // (19h30 - 8h) / 15min + 1
    expect(c[0]).toBe(inicioDia + 8 * 60 * 60_000);
    expect(c[c.length - 1]).toBe(inicioDia + (19 * 60 + 30) * 60_000);
    // alinhamento de 15 em 15
    for (const ms of c) expect(((ms - inicioDia) / 60_000) % 15).toBe(0);
  });

  it("antecedência corta os inícios passados", () => {
    const min = inicioDia + 18 * 60 * 60_000; // só a partir das 18:00
    const c = candidatosDoDia(YMD, min);
    expect(c.length).toBe(7); // 18:00 … 19:30
  });

  it("dia inteiro no passado → vazio", () => {
    const c = candidatosDoDia(YMD, inicioDia + 24 * 60 * 60_000);
    expect(c).toEqual([]);
  });
});
