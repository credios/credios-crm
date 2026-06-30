import { describe, expect, it } from "vitest";

import { montarFatos } from "@/lib/sdr/fluxo";
import { avaliarQualificacao } from "@/lib/sdr/qualificacao";
import type { Qualificacao } from "@/lib/whatsapp/heloisa";

// Lead "cru" mínimo — só os campos que montarFatos lê. Cast pra evitar montar as
// ~95 colunas; montarFatos não toca no resto.
function lead(over: Record<string, unknown> = {}) {
  return {
    valorCreditoCentavos: 20_000_000,
    valorImovelCentavos: 100_000_000,
    saldoDevedorCentavos: null,
    situacaoImovel: "Quitado",
    tipoImovel: "Casa",
    qualifTemImovelGarantia: null,
    qualifImovelRegularizado: null,
    qualifPendenciaBloqueante: null,
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("montarFatos", () => {
  it("mapeia sim/nao da conversa para boolean", () => {
    const q: Qualificacao = {
      tem_imovel_garantia: "sim",
      imovel_regularizado: "sim",
      pendencia_bloqueante: "nao",
    };
    const f = montarFatos(lead(), q);
    expect(f.temImovelGarantia).toBe(true);
    expect(f.pendenciaBloqueante).toBe(false);
    expect(f.imovelRegularizado).toBe("sim");
  });

  it("nao_sei vira null (booleanos), não false", () => {
    const f = montarFatos(lead(), { tem_imovel_garantia: "nao_sei", pendencia_bloqueante: "nao_sei" });
    expect(f.temImovelGarantia).toBeNull();
    expect(f.pendenciaBloqueante).toBeNull();
  });

  it("a conversa (turno) tem prioridade sobre o que estava persistido no lead", () => {
    const persistido = lead({
      qualifTemImovelGarantia: "nao",
      qualifPendenciaBloqueante: "sim",
      qualifImovelRegularizado: "nao",
    });
    const f = montarFatos(persistido, {
      tem_imovel_garantia: "sim",
      pendencia_bloqueante: "nao",
      imovel_regularizado: "sim",
    });
    expect(f.temImovelGarantia).toBe(true);
    expect(f.pendenciaBloqueante).toBe(false);
    expect(f.imovelRegularizado).toBe("sim");
  });

  it("usa o persistido quando o turno não traz o campo", () => {
    const f = montarFatos(lead({ qualifTemImovelGarantia: "sim" }), {});
    expect(f.temImovelGarantia).toBe(true);
  });

  it("fluxo completo: fatos montados de um lead qualificável passam na avaliação", () => {
    const f = montarFatos(lead(), {
      tem_imovel_garantia: "sim",
      imovel_regularizado: "sim",
      pendencia_bloqueante: "nao",
    });
    expect(avaliarQualificacao(f).qualificado).toBe(true);
  });
});
