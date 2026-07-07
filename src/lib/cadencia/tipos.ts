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
