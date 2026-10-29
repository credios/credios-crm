const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const COMPACT = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Centavos → "R$ 1.234,56" */
export function formatBrlFromCents(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return BRL.format(centavos / 100);
}

/** Centavos → "R$ 350K" (notação curta) */
export function formatBrlShort(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return `R$ ${COMPACT.format(centavos / 100)}`;
}
