import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capiOnLeadCreated } from "@/lib/capi/dispatch";
import { metaCapiAdapter } from "@/lib/capi/meta";

// ============================================================================
// Conversions API do Meta — o contrato que decide se a campanha aprende.
// ============================================================================
// Os quatro pontos cobertos aqui foram bugs reais encontrados na auditoria da
// primeira campanha de Meta (09/08/2026), ANTES de a CAPI ser ligada em prod.
// Cada um, sozinho, transformaria o feedback loop em ruído:
//
//   1. event_id divergente do browser        → conversão contada 2x
//   2. fbclid cru em vez do formato fbc      → correspondência descartada
//   3. action_source errado no lead_created  → evento de site vira "sistema"
//   4. Lead disparado no cadastro PARCIAL    → ensina o público que o nosso
//                                              próprio filtro rejeita
// ============================================================================

const PIXEL = "621720830339753";

/** Último corpo enviado ao graph.facebook.com, já desserializado. */
function lastEvent(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls.at(-1)!;
  return JSON.parse((init as RequestInit).body as string).data[0];
}

const baseInput = {
  eventTime: new Date("2026-08-09T12:00:00.000Z"),
  email: "cliente@exemplo.com",
  phone: "+5511999999999",
  valueCents: null,
  currency: "BRL",
  clickIds: {},
} as const;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.META_PIXEL_ID = PIXEL;
  process.env.META_ACCESS_TOKEN = "token-de-teste";
  delete process.env.META_TEST_EVENT_CODE;
  fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.META_PIXEL_ID;
  delete process.env.META_ACCESS_TOKEN;
});

describe("fbc — formato exigido pela CAPI", () => {
  it("reconstrói fb.1.<ts>.<fbclid> quando o cookie _fbc não veio", async () => {
    await metaCapiAdapter.send({
      ...baseInput,
      event: "lead_created",
      eventId: "evt-1",
      clickIds: { fbclid: "IwAR0abc" },
    });

    // O fbclid CRU é descartado pelo Meta — era o bug: mandar "IwAR0abc" aqui
    // equivalia a não mandar correspondência nenhuma justamente no tráfego pago.
    expect(lastEvent(fetchMock).user_data.fbc).toBe(
      `fb.1.${baseInput.eventTime.getTime()}.IwAR0abc`,
    );
  });

  it("prefere o cookie _fbc do browser (traz o timestamp real do clique)", async () => {
    const cookie = "fb.1.1754700000000.IwAR0abc";
    await metaCapiAdapter.send({
      ...baseInput,
      event: "lead_created",
      eventId: "evt-2",
      clickIds: { fbclid: "IwAR0abc" },
      fbc: cookie,
    });

    expect(lastEvent(fetchMock).user_data.fbc).toBe(cookie);
  });

  it("omite fbc quando não há cookie nem fbclid", async () => {
    await metaCapiAdapter.send({ ...baseInput, event: "lead_created", eventId: "evt-3" });
    expect(lastEvent(fetchMock).user_data.fbc).toBeUndefined();
  });

  it("manda fbp e fbc CRUS, e email/telefone hasheados", async () => {
    await metaCapiAdapter.send({
      ...baseInput,
      event: "lead_created",
      eventId: "evt-4",
      fbp: "fb.1.1754700000000.987654321",
      fbc: "fb.1.1754700000000.IwAR0abc",
    });

    const { user_data: ud } = lastEvent(fetchMock);
    // O Meta REJEITA fbp/fbc hasheados — são identificadores dele, não PII nossa.
    expect(ud.fbp).toBe("fb.1.1754700000000.987654321");
    expect(ud.fbc).toBe("fb.1.1754700000000.IwAR0abc");
    expect(ud.em).toMatch(/^[a-f0-9]{64}$/);
    expect(ud.ph).toMatch(/^[a-f0-9]{64}$/);
    expect(ud.em).not.toContain("@");
  });
});

describe("action_source", () => {
  it("lead_created é evento de site: website + event_source_url", async () => {
    await metaCapiAdapter.send({
      ...baseInput,
      event: "lead_created",
      eventId: "evt-5",
      eventSourceUrl: "https://www.credios.com.br/lp?utm_source=facebook",
    });

    const ev = lastEvent(fetchMock);
    expect(ev.event_name).toBe("Lead");
    expect(ev.action_source).toBe("website");
    expect(ev.event_source_url).toBe("https://www.credios.com.br/lp?utm_source=facebook");
  });

  it("qualificação e fechamento nascem no CRM: system_generated", async () => {
    await metaCapiAdapter.send({ ...baseInput, event: "lead_qualified", eventId: "evt-6" });
    expect(lastEvent(fetchMock)).toMatchObject({
      event_name: "SubmitApplication",
      action_source: "system_generated",
    });

    await metaCapiAdapter.send({
      ...baseInput,
      event: "lead_closed",
      eventId: "evt-7",
      valueCents: 1_250_000,
    });
    const fechado = lastEvent(fetchMock);
    expect(fechado.event_name).toBe("Purchase");
    expect(fechado.action_source).toBe("system_generated");
    // Valor em REAIS (a comissão vive em centavos no banco).
    expect(fechado.custom_data).toEqual({ currency: "BRL", value: 12_500 });
  });
});

describe("capiOnLeadCreated — quando o Lead pode sair", () => {
  const leadCompleto = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "cliente@exemplo.com",
    whatsapp: "+5511999999999",
    nome: "Fulano de Tal",
    cidade: "São Paulo",
    estado: "SP",
    objetivoCredito: "Investir",
    status: "novo",
    createdAt: new Date("2026-08-09T12:00:00.000Z"),
    paginaEntrada: "https://www.credios.com.br/lp",
    fbclid: "IwAR0abc",
  };

  it("usa o meta_event_id do browser como event_id (deduplicação com o pixel)", async () => {
    await capiOnLeadCreated(leadCompleto, "b9f1c0de-0000-4000-8000-000000000000");

    // Pixel e CAPI só deduplicam com event_name + event_id IDÊNTICOS. Com ids
    // diferentes o Meta contaria duas conversões pro mesmo lead.
    expect(lastEvent(fetchMock).event_id).toBe("b9f1c0de-0000-4000-8000-000000000000");
  });

  it("cai num id estável por lead quando o pixel não rodou", async () => {
    await capiOnLeadCreated(leadCompleto, null);
    // Estável = idempotente contra reenvio (o Meta deduplica sozinho).
    expect(lastEvent(fetchMock).event_id).toBe(`${leadCompleto.id}:lead_created`);
  });

  it("NÃO dispara no lead parcial (sem objetivo de crédito)", async () => {
    await capiOnLeadCreated({ ...leadCompleto, objetivoCredito: null }, null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NÃO dispara em lead recusado pela pré-qualificação do site", async () => {
    await capiOnLeadCreated({ ...leadCompleto, status: "desqualificado" }, null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("guardas de configuração", () => {
  it("não envia nada sem as env vars (CAPI apagada = no-op silencioso)", async () => {
    delete process.env.META_ACCESS_TOKEN;
    const res = await metaCapiAdapter.send({
      ...baseInput,
      event: "lead_created",
      eventId: "evt-8",
    });
    expect(res).toMatchObject({ ok: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("não envia sem nenhum identificador — o Meta rejeitaria", async () => {
    const res = await metaCapiAdapter.send({
      ...baseInput,
      event: "lead_created",
      eventId: "evt-9",
      email: null,
      phone: null,
    });
    expect(res).toMatchObject({ ok: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("capiOnLeadCreated — gate de score", () => {
  const leadCompleto = {
    id: "22222222-2222-2222-2222-222222222222",
    email: "cliente@exemplo.com",
    whatsapp: "+5511999999999",
    nome: "Beltrano de Tal",
    objetivoCredito: "Investir",
    status: "novo",
    createdAt: new Date("2026-08-09T12:00:00.000Z"),
  };

  it("NÃO dispara quando o gate de score reprovou", async () => {
    // Regressão real (09/08/2026): o disparo da CAPI acontecia ANTES de o
    // gate ser resolvido no webhook. Como a CAPI sai do servidor,
    // independente do browser, o Meta receberia o Lead que o browser tinha
    // acabado de suprimir — o gate viraria decoração.
    await capiOnLeadCreated(leadCompleto, null, false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispara quando o gate aprovou", async () => {
    await capiOnLeadCreated(leadCompleto, null, true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dispara quando o gate não foi pedido (undefined = resto do site)", async () => {
    await capiOnLeadCreated(leadCompleto, null, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
