import { formatBrlFromCents } from "@/lib/formatters/currency";
import { formatProperName } from "@/lib/formatters/proper-name";

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
 *
 * Nomes (lead e consultor) passam por `formatProperName` antes da substituição
 * — o cliente preenche o form em qualquer caixa ("FABIANA", "fabiana") mas a
 * mensagem que o consultor envia sai sempre com a forma canônica ("Fabiana").
 */
export function renderTemplate(content: string, lead: TemplateLeadVars): string {
  const nomeFormatado = formatProperName(lead.nome);
  const primeiroNome = nomeFormatado.split(/\s+/)[0] ?? "";
  const consultorFormatado = formatProperName(lead.consultor);
  const primeiroNomeConsultor = consultorFormatado.split(/\s+/)[0] ?? "";
  return content
    .replace(/\{\{nome\}\}/g, nomeFormatado)
    .replace(/\{\{primeiro_nome\}\}/g, primeiroNome)
    .replace(/\{\{consultor\}\}/g, consultorFormatado || "—")
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

/** Lead fictício pra preview no editor de templates. Inclui caixa irregular
 *  pra deixar visível no preview que `formatProperName` está em ação. */
export const SAMPLE_LEAD: TemplateLeadVars = {
  nome: "MARIA DA SILVA SOBRENOME",
  cidade: "Blumenau",
  estado: "SC",
  valorCreditoCentavos: 35_000_000,
  valorImovelCentavos: 80_000_000,
  consultor: "Gabriel Marinho",
};
