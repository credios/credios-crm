import { beforeEach, describe, expect, it, vi } from "vitest";

// Automações que NÃO podem falar com o síndico (condomínio) nem com cliente de
// parceiro: aviso de desqualificação, lembrete de reunião e links de
// agenda/portal na cadência. O banco é um dublê encadeável: cada select
// devolve o próximo item de `selects`.

const selects: unknown[][] = [];
const updates: unknown[] = [];

function chain(result: unknown) {
  const p = Promise.resolve(result);
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, k) {
      if (k === "then") return p.then.bind(p);
      if (k === "catch") return p.catch.bind(p);
      if (k === "finally") return p.finally.bind(p);
      return () => proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => chain(selects.shift() ?? [])),
    insert: vi.fn(() => chain([])),
    update: vi.fn((t: unknown) => {
      updates.push(t);
      return chain([]);
    }),
  },
}));

const enviarTextoWhatsApp = vi.fn(async () => ({ ok: true, id: "w1" }));
const enviarTemplateWhatsApp = vi.fn(async () => ({ ok: true, id: "w2" }));
vi.mock("@/lib/whatsapp/meta", () => ({ enviarTextoWhatsApp, enviarTemplateWhatsApp }));

const sendNaoSeguiremosEmail = vi.fn(async () => ({ ok: true }));
const sendReuniaoLembreteEmail = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/notifications/email", () => ({
  sendNaoSeguiremosEmail,
  sendReuniaoLembreteEmail,
  sendReuniaoLembreteConsultorEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/sdr/agendar", () => ({ cancelarReuniao: vi.fn(async () => {}) }));

const gerarAgendaToken = vi.fn(() => "tok");
vi.mock("@/lib/agenda/token", () => ({ gerarAgendaToken }));
const generatePortalToken = vi.fn(async () => ({ token: "docs" }));
vi.mock("@/lib/portal/token", () => ({
  generatePortalToken,
  portalUrl: (t: string) => `https://crm.credios.com.br/portal/${t}`,
}));
const buscarCondominio = vi.fn(async () => ({ sindicoNome: "ANA PAULA SOUZA" }));
vi.mock("@/lib/condominio/persist", () => ({ buscarCondominio }));

const { aoEncerrarLead } = await import("@/lib/leads/encerramento");
const { processarLembretesReuniao } = await import("@/lib/sdr/lembrete");
const { prepararMensagemPasso } = await import("@/lib/cadencia/render");

type LeadEncerrado = Parameters<typeof aoEncerrarLead>[0];
const leadBase = {
  id: "l1",
  nome: "Condomínio Solar",
  whatsapp: "+5547999990000",
  email: "sindico@solar.com.br",
  produto: "CONDOMINIO",
  parceiroId: null,
  parceiroPortalId: null,
  source: null,
} as unknown as LeadEncerrado;

beforeEach(() => {
  selects.length = 0;
  updates.length = 0;
  vi.clearAllMocks();
});

describe("aviso de desqualificação (encerramento)", () => {
  it("condomínio: não manda WhatsApp nem e-mail ao síndico", async () => {
    selects.push([]); // reuniões futuras
    await aoEncerrarLead(leadBase, "desqualificado");
    expect(enviarTextoWhatsApp).not.toHaveBeenCalled();
    expect(sendNaoSeguiremosEmail).not.toHaveBeenCalled();
  });

  it("CGI indicado por parceiro: também não", async () => {
    selects.push([]);
    await aoEncerrarLead(
      { ...leadBase, produto: "CGI", parceiroId: "p1" } as LeadEncerrado,
      "desqualificado",
    );
    expect(enviarTextoWhatsApp).not.toHaveBeenCalled();
    expect(sendNaoSeguiremosEmail).not.toHaveBeenCalled();
  });

  it("CGI direto: segue avisando por e-mail", async () => {
    selects.push([], []); // reuniões, última mensagem recebida (janela fechada)
    await aoEncerrarLead({ ...leadBase, produto: "CGI" } as LeadEncerrado, "desqualificado");
    expect(sendNaoSeguiremosEmail).toHaveBeenCalledTimes(1);
  });
});

describe("lembrete de reunião ao cliente", () => {
  const reuniao = {
    reuniaoId: "r1",
    leadId: "l1",
    inicio: new Date(Date.now() + 30 * 60_000),
    meetLink: null,
    nome: "Condomínio Solar",
    whatsapp: "+5547999990000",
    email: "sindico@solar.com.br",
    produto: "CONDOMINIO",
    parceiroId: null,
    parceiroPortalId: null,
    source: null,
  };

  it("condomínio: não envia e marca como tratado (não repete a cada 10 min)", async () => {
    selects.push([reuniao]);
    const r = await processarLembretesReuniao();
    expect(enviarTextoWhatsApp).not.toHaveBeenCalled();
    expect(enviarTemplateWhatsApp).not.toHaveBeenCalled();
    expect(sendReuniaoLembreteEmail).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(r.enviados).toBe(0);
  });

  it("CGI direto: envia", async () => {
    selects.push([{ ...reuniao, produto: "CGI", nome: "Fabiana Souza" }], []);
    const r = await processarLembretesReuniao();
    expect(enviarTemplateWhatsApp).toHaveBeenCalledTimes(1);
    expect(r.enviados).toBe(1);
  });
});

describe("mensagem da cadência", () => {
  const passo = { tipo: "mensagem", templateId: "t1" } as Parameters<typeof prepararMensagemPasso>[1];
  const lead = {
    id: "l1",
    nome: "Condomínio Solar",
    cidade: null,
    estado: null,
    valorCreditoCentavos: 50_000_000,
    valorImovelCentavos: null,
    produto: "CONDOMINIO",
  };

  it("condomínio: {{sindico}} vem da tabela-irmã e não gera link de agenda/docs", async () => {
    selects.push([{ conteudo: "{{sindico}}, agende: {{link_agenda}} {{link_docs}}" }]);
    const msg = await prepararMensagemPasso(lead, passo, "Rodrigo");
    expect(msg).toContain("Ana,");
    expect(msg).toContain("{{link_agenda}}");
    expect(gerarAgendaToken).not.toHaveBeenCalled();
    expect(generatePortalToken).not.toHaveBeenCalled();
  });

  it("CGI: gera os links como antes", async () => {
    selects.push([{ conteudo: "Agende: {{link_agenda}}" }]);
    const msg = await prepararMensagemPasso({ ...lead, produto: "CGI" }, passo, "Rodrigo");
    expect(gerarAgendaToken).toHaveBeenCalledTimes(1);
    expect(msg).toContain("/agendar/tok");
    expect(buscarCondominio).not.toHaveBeenCalled();
  });
});
