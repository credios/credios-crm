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
 * Retorna saudação adequada ao horário do dia (regra confirmada pelo owner):
 *   00:00 – 11:59 → "Bom dia"
 *   12:00 – 17:59 → "Boa tarde"
 *   18:00 – 23:59 → "Boa noite"
 *
 * SEMPRE em horário de Brasília — renderTemplate também roda no SERVER
 * (cadência da Mesa, links do wa.me), e a Vercel opera em UTC: usar a hora
 * local do processo dava "Boa noite" às 17h de Brasília (20h UTC).
 */
export function getSaudacao(now: Date = new Date()): "Bom dia" | "Boa tarde" | "Boa noite" {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Arredonda o valor buscado pro número "redondo" mais próximo, em linguagem
 * de conversa: 480k → "R$ 500 mil", 620k → "R$ 600 mil", 1.35M → "R$ 1,4
 * milhão". Usado em mensagens de prova social ("atendi um caso parecido, na
 * faixa dos X") — o valor precisa soar natural, não exato. Sem valor no lead,
 * cai num meio-de-mercado genérico.
 */
export function valorCreditoRedondo(valorCentavos: number | null): string {
  const reais = valorCentavos != null ? valorCentavos / 100 : null;
  if (!reais || reais <= 0) return "R$ 500 mil";
  if (reais < 1_000_000) {
    // passo de 50 mil (mínimo 100 mil pra frase fazer sentido)
    const redondo = Math.max(100_000, Math.round(reais / 50_000) * 50_000);
    if (redondo >= 1_000_000) return "R$ 1 milhão";
    return `R$ ${Math.round(redondo / 1000)} mil`;
  }
  // acima de 1M: passo de 100 mil → "R$ 1,4 milhão" / "R$ 2 milhões"
  const milhoes = Math.round(reais / 100_000) / 10;
  const inteiro = Number.isInteger(milhoes);
  const num = inteiro ? String(milhoes) : milhoes.toFixed(1).replace(".", ",");
  return `R$ ${num} ${milhoes >= 2 ? "milhões" : "milhão"}`;
}

/**
 * Substitui variáveis {{saudacao}}, {{nome}}, {{primeiro_nome}},
 * {{primeiro_nome_consultor}}, {{consultor}}, {{valor_credito}},
 * {{valor_credito_redondo}}, {{valor_imovel}}, {{cidade}}, {{estado}} no
 * conteúdo do template.
 *
 * Nomes (lead e consultor) passam por `formatProperName` antes da substituição
 * — o cliente preenche o form em qualquer caixa ("FABIANA", "fabiana") mas a
 * mensagem que o consultor envia sai sempre com a forma canônica ("Fabiana").
 */
export function renderTemplate(
  content: string,
  lead: TemplateLeadVars,
  /** Links por lead ({{link_agenda}}, {{link_docs}}) — gerados server-side pela
   *  cadência; quando ausentes, os placeholders ficam como estão. */
  links?: { agenda?: string; docs?: string },
): string {
  const nomeFormatado = formatProperName(lead.nome);
  const primeiroNome = nomeFormatado.split(/\s+/)[0] ?? "";
  const consultorFormatado = formatProperName(lead.consultor);
  const primeiroNomeConsultor = consultorFormatado.split(/\s+/)[0] ?? "";
  if (links?.agenda) content = content.replace(/\{\{link_agenda\}\}/g, links.agenda);
  if (links?.docs) content = content.replace(/\{\{link_docs\}\}/g, links.docs);
  return content
    .replace(/\{\{saudacao\}\}/g, getSaudacao())
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
      /\{\{valor_credito_redondo\}\}/g,
      valorCreditoRedondo(lead.valorCreditoCentavos),
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
