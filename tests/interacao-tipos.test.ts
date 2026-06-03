import { describe, expect, it } from "vitest";

import {
  ACONTECIMENTO_OPERACAO_TIPOS,
  isAcontecimentoOperacao,
  isContatoComCliente,
  isEventoSistema,
  NAO_CONTATO_TIPOS,
} from "@/lib/leads/interacao-tipos";

describe("interacao-tipos — classificação por natureza", () => {
  const CONTATOS = [
    "ligacao",
    "whatsapp_enviado",
    "whatsapp_recebido",
    "email",
    "reuniao",
    "contato",
    // Documento recebido segue contando como contato com o cliente
    // (decisão: só os 3 acontecimentos novos deixam de contar).
    "documento_recebido",
  ];

  it("contatos com o cliente contam como contato", () => {
    for (const t of CONTATOS) {
      expect(isContatoComCliente(t)).toBe(true);
      expect(isAcontecimentoOperacao(t)).toBe(false);
    }
  });

  it("acontecimentos da operação NÃO contam como contato com o cliente", () => {
    for (const t of ACONTECIMENTO_OPERACAO_TIPOS) {
      expect(isContatoComCliente(t)).toBe(false);
      expect(isAcontecimentoOperacao(t)).toBe(true);
      expect(isEventoSistema(t)).toBe(false);
    }
  });

  it("os 3 acontecimentos novos são exatamente esses", () => {
    expect([...ACONTECIMENTO_OPERACAO_TIPOS]).toEqual([
      "contato_banco",
      "analise_credito_solicitada",
      "vistoria_realizada",
    ]);
  });

  it("eventos de sistema não contam como contato nem acontecimento", () => {
    for (const t of ["mudanca_status", "mudanca_atribuicao", "evento_sistema"]) {
      expect(isContatoComCliente(t)).toBe(false);
      expect(isEventoSistema(t)).toBe(true);
      expect(isAcontecimentoOperacao(t)).toBe(false);
    }
  });

  it("NAO_CONTATO_TIPOS = acontecimentos + sistema", () => {
    expect(new Set(NAO_CONTATO_TIPOS)).toEqual(
      new Set([
        "contato_banco",
        "analise_credito_solicitada",
        "vistoria_realizada",
        "mudanca_status",
        "mudanca_atribuicao",
        "evento_sistema",
      ]),
    );
  });
});
