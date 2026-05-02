import { formatBrlFromCents } from "@/lib/formatters/currency";

export type TemplateLeadVars = {
  nome: string;
  cidade: string | null;
  estado: string | null;
  valorCreditoCentavos: number | null;
  valorImovelCentavos: number | null;
  /** Nome do consultor logado (assina mensagens). Resolve {{consultor}}. */
  consultor?: string | null;
};

/**
 * Substitui variáveis {{nome}}, {{primeiro_nome}}, {{primeiro_nome_consultor}},
 * {{consultor}}, {{valor_credito}}, {{valor_imovel}}, {{cidade}}, {{estado}}
 * no conteúdo do template.
 */
export function renderTemplate(content: string, lead: TemplateLeadVars): string {
  const primeiroNome = (lead.nome ?? "").split(/\s+/)[0] ?? "";
  const consultor = lead.consultor ?? "";
  const primeiroNomeConsultor = consultor.split(/\s+/)[0] ?? "";
  return content
    .replace(/\{\{nome\}\}/g, lead.nome ?? "")
    .replace(/\{\{primeiro_nome\}\}/g, primeiroNome)
    .replace(/\{\{consultor\}\}/g, consultor || "—")
    .replace(/\{\{primeiro_nome_consultor\}\}/g, primeiroNomeConsultor || "—")
    .replace(
      /\{\{valor_credito\}\}/g,
      lead.valorCreditoCentavos != null
        ? formatBrlFromCents(lead.valorCreditoCentavos)
        : "—",
    )
    .replace(
      /\{\{valor_imovel\}\}/g,
      lead.valorImovelCentavos != null
        ? formatBrlFromCents(lead.valorImovelCentavos)
        : "—",
    )
    .replace(/\{\{cidade\}\}/g, lead.cidade ?? "—")
    .replace(/\{\{estado\}\}/g, lead.estado ?? "—");
}

/** Lead fictício pra preview no editor de templates. */
export const SAMPLE_LEAD: TemplateLeadVars = {
  nome: "Maria Silva Sobrenome",
  cidade: "Blumenau",
  estado: "SC",
  valorCreditoCentavos: 35_000_000,
  valorImovelCentavos: 80_000_000,
  consultor: "Gabriel Marinho",
};
