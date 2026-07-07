// Tipos + lógica PURA da cadência (sem server-only — testável e importável de
// client components pra tipagem).

export type PassoTipo = "mensagem" | "ligacao" | "decisao";

export type PassoCadencia = {
  titulo: string;
  /** Dias APÓS o passo anterior (passo 0 = após a entrada no estágio). */
  deltaDias: number;
  tipo: PassoTipo;
  /** mensagens_template.id (só tipo "mensagem"). */
  templateId: string | null;
  /** Frase de energia exibida no card da Mesa. */
  energia: string | null;
};

export type CadenciaStatus = {
  id: string;
  statusKey: string;
  passos: PassoCadencia[];
  ativa: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

/** Data do próximo passo após executar/pular o atual. Null = já está na decisão. */
export function proximaDataAposExecutar(
  passos: PassoCadencia[],
  passoAtual: number,
  agora: Date = new Date(),
): { proximoPasso: number; proximaEm: Date } | null {
  const proximo = passoAtual + 1;
  if (proximo >= passos.length) return null;
  return {
    proximoPasso: proximo,
    proximaEm: new Date(agora.getTime() + passos[proximo]!.deltaDias * DIA_MS),
  };
}

/**
 * Motivo canônico de PERDIDO quando o encerramento vem da cadência/faxina/
 * auto-perdido (valores de MOTIVOS_PERDIDO — agrupam certo nos relatórios).
 * Regra do owner: conversa_inicial e aguardando_resposta → "Sem resposta";
 * estágios com esforço maior (docs) → "Sem retorno após várias tentativas".
 */
export function motivoPerdidoPadrao(status: string): string {
  if (status === "conversa_inicial" || status === "aguardando_resposta" || status === "novo") {
    return "Sem resposta";
  }
  return "Sem retorno após várias tentativas";
}

/**
 * O desfecho de reunião só move o lead automaticamente (realizada → docs,
 * no-show → conversa_inicial) se ele ainda está num estágio PRÉ-reunião.
 * Lead que já avançou além (docs, negociação, fechado…) mantém o status —
 * o desfecho vira só registro. Caso real: card antigo de reunião respondido
 * dias depois REGREDIU um lead em_negociacao pra aguardando_documentacao.
 */
export function desfechoReuniaoMoveLead(status: string): boolean {
  return [
    "novo",
    "conversa_inicial",
    "aguardando_resposta",
    "sem_resposta",
    "reuniao_agendada",
  ].includes(status);
}
