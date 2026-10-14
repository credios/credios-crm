import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  dataExtenso,
  mesclarContrato,
  nomeContratual,
  percentual,
  percentualExtenso,
} from "@/lib/portal-parceiro/contrato/mescla";
import {
  CONTRATO_MODELO_V3,
  CONTRATO_MODELO_VIGENTE,
  VERSAO_MODELO,
} from "@/lib/portal-parceiro/contrato/modelo";
import { buildSignedPdf, renderContractPdf } from "@/lib/portal-parceiro/contrato/pdf";
import { gerarCodigoVerificacao, gerarOtp, hashIgual, hashToken, sha256Hex } from "@/lib/portal-parceiro/tokens";

const PF = {
  nome: "Maria da Silva",
  empresa: null,
  cpfCnpj: "52998224725",
  email: "maria@exemplo.com.br",
  whatsapp: "+5547999990000",
  comissaoPadraoBps: null,
};

describe("mescla do contrato vigente", () => {
  const html = mesclarContrato(CONTRATO_MODELO_VIGENTE, PF, new Date("2026-10-13T15:00:00Z"));

  it("não deixa nenhum campo {{...}} sem preencher", () => {
    expect(html).not.toMatch(/\{\{/);
  });

  it("cobre os dois produtos com as comissões combinadas", () => {
    expect(html).toContain("crédito com garantia de imóvel");
    expect(html).toContain("crédito para condomínios");
    // CGI: padrão 3,00% em até 10 dias úteis da liberação
    expect(html).toContain("3,00% (três vírgula zero zero por cento)</strong> sobre o valor líquido da operação");
    expect(html).toContain("em até 10 dias úteis contados da liberação");
    // Condomínio: 3% fixo, 10 dias corridos da assinatura do contrato de crédito
    expect(html).toContain("comissão fixa de <strong>3,00%");
    expect(html).toContain("em até 10 dias corridos contados da assinatura do contrato de crédito");
    // v4: de uma vez, sobre o total contratado, mesmo com liberação em parcelas
    expect(html).toContain("paga de uma única vez");
    expect(html).toContain("sobre o valor líquido total do crédito contratado pelo condomínio");
    expect(html).toContain("ainda que a liberação do crédito ao condomínio ocorra em parcelas");
  });

  it("usa o percentual próprio do parceiro no CGI, sem mexer no de condomínio", () => {
    const h = mesclarContrato(CONTRATO_MODELO_VIGENTE, { ...PF, comissaoPadraoBps: 250 }, new Date());
    expect(h).toContain("2,50% (dois vírgula cinco zero por cento)</strong> sobre o valor líquido da operação");
    expect(h).toContain("comissão fixa de <strong>3,00%");
  });

  it("qualifica as partes e data por extenso em Brasília", () => {
    expect(html).toContain("Maria da Silva, inscrito(a) no CPF/CNPJ sob nº 529.982.247-25");
    expect(html).toContain("Blumenau/SC, 13 de outubro de 2026.");
    expect(html).not.toContain("neste ato representada por Maria");
  });

  it("PJ: a empresa é a parte e a pessoa assina como representante", () => {
    const pj = { ...PF, empresa: "Imobiliária Exemplo Ltda", cpfCnpj: "11222333000181" };
    const h = mesclarContrato(CONTRATO_MODELO_VIGENTE, pj, new Date());
    expect(h).toContain("Imobiliária Exemplo Ltda, inscrito(a) no CPF/CNPJ sob nº 11.222.333/0001-81, neste ato representada por Maria da Silva");
    // representante informado, com CPF, substitui a pessoa do cadastro
    const h2 = mesclarContrato(
      CONTRATO_MODELO_VIGENTE,
      { ...pj, representanteNome: "João Souza", representanteCpf: "52998224725" },
      new Date(),
    );
    expect(h2).toContain("neste ato representada por João Souza, CPF 529.982.247-25");
    expect(h2).toContain("declara, sob as penas da lei, ser seu representante legal");
    expect(nomeContratual(pj)).toBe("Imobiliária Exemplo Ltda");
  });

  it("escapa HTML vindo do cadastro", () => {
    const h = mesclarContrato(CONTRATO_MODELO_VIGENTE, { ...PF, nome: "<script>x</script>" }, new Date());
    expect(h).not.toContain("<script>");
  });
});

describe("versões do modelo", () => {
  it("a vigente é a 4 e a 3 continua intacta (contrato assinado não muda)", () => {
    expect(VERSAO_MODELO).toBe(4);
    expect(CONTRATO_MODELO_V3).toContain("sobre o valor líquido do crédito liberado ao condomínio");
    expect(CONTRATO_MODELO_V3).not.toContain("paga de uma única vez");
  });
});

describe("helpers", () => {
  it("percentual e extenso", () => {
    expect(percentual(300)).toBe("3,00");
    expect(percentualExtenso("1,50")).toBe("um vírgula cinco zero por cento");
  });

  it("dataExtenso respeita o fuso de Brasília na virada do dia", () => {
    // 02:00 UTC do dia 14 ainda é dia 13 em Brasília
    expect(dataExtenso(new Date("2026-10-14T02:00:00Z"))).toBe("13 de outubro de 2026");
  });

  it("código de verificação, OTP e comparação de hash", () => {
    expect(gerarCodigoVerificacao()).toMatch(/^CRD-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const { otp, hash } = gerarOtp();
    expect(otp).toMatch(/^\d{6}$/);
    expect(hashIgual(hashToken(otp), hash)).toBe(true);
    expect(hashIgual(hashToken("000000x"), hash)).toBe(false);
    expect(hashIgual("abc", hash)).toBe(false);
  });
});

describe("PDF do contrato", () => {
  it("gera o original e a via final com manifesto; o hash confere", async () => {
    const html = mesclarContrato(CONTRATO_MODELO_VIGENTE, PF, new Date("2026-10-13T15:00:00Z"));
    const original = await renderContractPdf(html, { verifyCode: "CRD-TEST-0001" });
    const paginasOriginal = (await PDFDocument.load(original)).getPageCount();
    expect(paginasOriginal).toBeGreaterThanOrEqual(2);

    const assinadoEm = new Date("2026-10-13T16:00:00Z");
    const { pdf, hash } = await buildSignedPdf({
      unsignedPdf: original,
      signers: [
        { role: "PARCEIRO(A)", name: PF.nome, document: "529.982.247-25", email: PF.email, signedAt: assinadoEm, verification: "Sessão + código por e-mail" },
        { role: "CREDIOS (CONTRATADA)", name: "Gabriel Meirelles", document: "55.986.282/0001-30", email: "admin@credios.com.br", signedAt: new Date("2026-10-13T17:00:00Z"), verification: "Admin com TOTP" },
      ],
      events: [
        { event: "GENERATED", createdAt: new Date("2026-10-13T15:00:00Z") },
        { event: "OTP_VERIFIED", createdAt: assinadoEm, ip: "200.1.2.3", userAgent: "Mozilla/5.0" },
        { event: "SIGNED", createdAt: assinadoEm, ip: "200.1.2.3", userAgent: "Mozilla/5.0" },
        { event: "ADMIN_SIGNED", createdAt: new Date("2026-10-13T17:00:00Z"), ip: "200.9.9.9", userAgent: "Mozilla/5.0" },
      ],
      verifyCode: "CRD-TEST-0001",
      verifyUrl: "https://crm.credios.com.br/portal-parceiro/verificar/CRD-TEST-0001",
    });

    expect(hash).toBe(sha256Hex(pdf));
    // a via final ganha a(s) página(s) de manifesto
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(paginasOriginal);
  });
});
