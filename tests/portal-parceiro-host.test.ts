import { describe, expect, it } from "vitest";

import { ehHostDoPortal, rotaNoHostDoPortal } from "@/lib/portal-parceiro/host";

describe("host do portal de parceiros", () => {
  it("reconhece só o domínio do portal", () => {
    expect(ehHostDoPortal("parceiros.credios.com.br")).toBe(true);
    expect(ehHostDoPortal("PARCEIROS.credios.com.br:443")).toBe(true);
    expect(ehHostDoPortal("crm.credios.com.br")).toBe(false);
    expect(ehHostDoPortal("parceiros.credios.com.br.evil.com")).toBe(false);
    expect(ehHostDoPortal(null)).toBe(false);
  });

  it("deixa passar o portal e a API dele", () => {
    for (const p of [
      "/portal-parceiro",
      "/portal-parceiro/clientes/novo",
      "/api/portal-parceiro/entrar",
      "/_next/data/x.json",
    ]) {
      expect(rotaNoHostDoPortal(p)).toEqual({ tipo: "seguir" });
    }
  });

  it("raiz vai pro portal", () => {
    expect(rotaNoHostDoPortal("/")).toEqual({ tipo: "redirecionar", destino: "/portal-parceiro" });
  });

  it("verificação de contrato impressa nos PDFs antigos continua funcionando", () => {
    expect(rotaNoHostDoPortal("/verificar/crd-7k2m-9xq4")).toEqual({
      tipo: "redirecionar",
      destino: "/portal-parceiro/verificar/CRD-7K2M-9XQ4",
    });
    expect(rotaNoHostDoPortal("/verificar")).toEqual({
      tipo: "redirecionar",
      destino: "/portal-parceiro/verificar",
    });
  });

  it("endereços do portal antigo são levados pro novo", () => {
    const destino = (p: string) => {
      const d = rotaNoHostDoPortal(p);
      return d.tipo === "redirecionar" ? d.destino : null;
    };
    expect(destino("/entrar")).toBe("/portal-parceiro/entrar");
    expect(destino("/app")).toBe("/portal-parceiro");
    expect(destino("/app/clientes")).toBe("/portal-parceiro/clientes");
    expect(destino("/app/clientes/novo")).toBe("/portal-parceiro/clientes/novo");
    expect(destino("/app/clientes/ckx123")).toBe("/portal-parceiro/clientes");
    expect(destino("/app/comissoes")).toBe("/portal-parceiro/comissoes");
    expect(destino("/convite/abc")).toBe("/portal-parceiro/entrar");
    expect(destino("/contrato/abc")).toBe("/portal-parceiro/entrar");
    expect(destino("/admin/parceiros")).toBe("https://crm.credios.com.br/parceiros");
  });

  it("o CRM interno NÃO é alcançável pelo domínio do portal", () => {
    for (const p of ["/leads", "/login", "/parceiros", "/api/leads", "/api/webhooks/lead", "/configuracoes"]) {
      expect(rotaNoHostDoPortal(p)).toEqual({ tipo: "redirecionar", destino: "/portal-parceiro" });
    }
  });

  it("prefixo parecido não engana", () => {
    expect(rotaNoHostDoPortal("/portal-parceiros-x")).toEqual({
      tipo: "redirecionar",
      destino: "/portal-parceiro",
    });
    expect(rotaNoHostDoPortal("/api/portal-parceiro")).toEqual({
      tipo: "redirecionar",
      destino: "/portal-parceiro",
    });
  });
});
