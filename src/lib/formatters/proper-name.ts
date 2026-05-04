/**
 * Formata um nome próprio em Title Case PT-BR.
 *
 * Lida com inputs em qualquer caixa ("FABIANA", "fabiana", "FaBiAnA") e devolve
 * sempre a forma canônica com a primeira letra de cada palavra em maiúsculo —
 * exceto preposições/conjunções comuns ("da", "de", "do", "e" etc.), que ficam
 * minúsculas no meio do nome (mas capitalizadas se forem a primeira palavra).
 *
 * Também trata apóstrofos e hífens (ex.: "d'arc" → "D'Arc",
 * "ana-luiza" → "Ana-Luiza").
 *
 * Uso primário: render de templates de mensagem onde o nome do lead aparece —
 * o cliente preenche o form em qualquer caixa, mas a mensagem que o consultor
 * envia precisa estar bem formatada ("Olá, Fabiana!" e não "Olá, FABIANA!").
 *
 * @example
 * formatProperName("FABIANA")           // "Fabiana"
 * formatProperName("maria DA SILVA")    // "Maria da Silva"
 * formatProperName("DA SILVA")          // "Da Silva"  (primeira palavra capitaliza)
 * formatProperName("ana-luiza d'arc")   // "Ana-Luiza D'Arc"
 * formatProperName("")                  // ""
 * formatProperName(null)                // ""
 */

// Preposições/conjunções/artigos comuns em nomes PT-BR. Lista intencionalmente
// curta — focamos nos casos clássicos. Palavras fora dela são capitalizadas.
const PT_STOP_WORDS = new Set([
  "da", "das", "de", "di", "do", "dos", "du",
  "e",
  "del", "della", "der", "von", "van", // sobrenomes estrangeiros comuns
  "y", "la", "le",
]);

/**
 * Capitaliza UMA palavra respeitando apóstrofos e hífens internos.
 * Implementação preserva o separador (split com group capturado).
 */
function capitalizeWord(word: string): string {
  if (!word) return word;
  return word
    .toLowerCase()
    .split(/(['\-])/) // mantém os separadores no array resultante
    .map((segment) => {
      if (segment === "'" || segment === "-") return segment;
      if (segment.length === 0) return segment;
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join("");
}

export function formatProperName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";

  const words = trimmed.split(/\s+/);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      // Primeira palavra sempre capitaliza, mesmo que seja preposição
      // (ex.: "Da Silva" como nome completo, não "da Silva").
      if (index === 0) return capitalizeWord(word);
      if (PT_STOP_WORDS.has(lower)) return lower;
      return capitalizeWord(word);
    })
    .join(" ");
}
