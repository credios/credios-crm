import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  PRODUTO_LABEL_CURTO,
  PRODUTOS_ATIVOS,
  type Produto,
} from "@/lib/produtos";

type Props = {
  atual: Produto | null;
  /** Consultor visualizado (?consultor=) — preservado ao trocar o produto. */
  consultorParam: string | null;
  /** Página que recebe o filtro (default: Minha Mesa). */
  base?: string;
};

/** Abas de produto (Mesa, Negociações). Links simples: a página é server-rendered. */
export function FiltroProdutoMesa({ atual, consultorParam, base = "/minha-mesa" }: Props) {
  const opcoes: { valor: Produto | null; label: string }[] = [
    { valor: null, label: "Todos" },
    ...PRODUTOS_ATIVOS.map((p) => ({ valor: p, label: PRODUTO_LABEL_CURTO[p] })),
  ];
  return (
    <nav
      aria-label="Filtrar por produto"
      className="inline-flex rounded-lg border border-border bg-background p-0.5 text-sm shadow-elev-sm"
    >
      {opcoes.map((o) => {
        const q = new URLSearchParams();
        if (consultorParam) q.set("consultor", consultorParam);
        if (o.valor) q.set("produto", o.valor);
        const ativo = o.valor === atual;
        return (
          <Link
            key={o.label}
            href={`${base}${q.size ? `?${q.toString()}` : ""}`}
            prefetch={false}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 transition-colors",
              ativo
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
