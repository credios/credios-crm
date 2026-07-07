import { describe, expect, it } from "vitest";

import {
  desfechoReuniaoMoveLead,
  proximaDataAposExecutar,
  type PassoCadencia,
} from "@/lib/cadencia/tipos";

// Cadência exemplo — espelha a de aguardando_resposta aprovada pelo owner:
// D0 msg1, D+1 msg2, D+3 ligação, D+5 msg3, D+8 msg final, D+10 decisão.
const PASSOS: PassoCadencia[] = [
  { titulo: "Mensagem 1", deltaDias: 0, tipo: "mensagem", templateId: "t1", energia: null },
  { titulo: "Mensagem 2", deltaDias: 1, tipo: "mensagem", templateId: "t2", energia: null },
  { titulo: "Ligação", deltaDias: 2, tipo: "ligacao", templateId: null, energia: "O não já temos!" },
  { titulo: "Mensagem 3", deltaDias: 2, tipo: "mensagem", templateId: "t3", energia: null },
  { titulo: "Mensagem final", deltaDias: 3, tipo: "mensagem", templateId: "t4", energia: null },
  { titulo: "Decisão", deltaDias: 2, tipo: "decisao", templateId: null, energia: null },
];

const DIA = 24 * 60 * 60 * 1000;

describe("proximaDataAposExecutar", () => {
  it("avança pro próximo passo com o delta do PRÓXIMO (relativo à execução)", () => {
    const agora = new Date("2026-07-06T12:00:00Z");
    const r = proximaDataAposExecutar(PASSOS, 0, agora);
    expect(r).not.toBeNull();
    expect(r!.proximoPasso).toBe(1);
    // passo 1 tem delta 1 dia
    expect(r!.proximaEm.getTime()).toBe(agora.getTime() + 1 * DIA);
  });

  it("execução ATRASADA não acumula atraso: próximo passo conta do agora", () => {
    // Executou a msg 2 cinco dias atrasado → a ligação (delta 2) fica pra
    // daqui a 2 dias, não "no passado".
    const agora = new Date("2026-07-20T09:00:00Z");
    const r = proximaDataAposExecutar(PASSOS, 1, agora);
    expect(r!.proximoPasso).toBe(2);
    expect(r!.proximaEm.getTime()).toBe(agora.getTime() + 2 * DIA);
  });

  it("no último passo (decisão) não há avanço automático", () => {
    expect(proximaDataAposExecutar(PASSOS, 5)).toBeNull();
  });

  it("cadeia completa executada em dia soma D+10 da entrada", () => {
    // Executando cada passo exatamente no vencimento, a decisão cai em D+10.
    let t = new Date("2026-07-06T08:00:00Z");
    let passo = 0;
    const inicio = t.getTime();
    for (;;) {
      const r = proximaDataAposExecutar(PASSOS, passo, t);
      if (!r) break;
      passo = r.proximoPasso;
      t = r.proximaEm;
    }
    expect(passo).toBe(5); // decisão
    expect((t.getTime() - inicio) / DIA).toBe(10);
  });
});

describe("desfechoReuniaoMoveLead", () => {
  it("move o lead nos estágios pré-reunião", () => {
    for (const st of ["novo", "conversa_inicial", "aguardando_resposta", "sem_resposta", "reuniao_agendada"]) {
      expect(desfechoReuniaoMoveLead(st)).toBe(true);
    }
  });

  it("NÃO regride lead que já avançou além da reunião (bug real: em_negociacao → docs)", () => {
    for (const st of ["aguardando_documentacao", "documentacao_enviada", "em_negociacao", "fechado", "perdido", "desqualificado"]) {
      expect(desfechoReuniaoMoveLead(st)).toBe(false);
    }
  });
});
