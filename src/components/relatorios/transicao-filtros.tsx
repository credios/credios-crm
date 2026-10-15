"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useContext,
  useOptimistic,
  useTransition,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

// Troca de filtro nos relatórios = navegação (searchParams) que re-renderiza a
// página no servidor. Sem isto, o clique não dava retorno nenhum até a
// resposta chegar: o Select até "voltava" pro valor antigo, porque lê a URL.
//
// Este provider compartilha UMA transição entre os filtros e a área do
// relatório:
//   - `query` é otimista — o filtro mostra o valor novo no mesmo frame;
//   - enquanto a navegação está pendente, a área fica esmaecida e aria-busy;
//   - quando o shell da página nova chega, cada seção mostra o próprio
//     skeleton (Suspense com `key` dos filtros, na página) e vai aparecendo.

type Ctx = {
  query: URLSearchParams;
  pendente: boolean;
  navegar: (next: URLSearchParams) => void;
};

const TransicaoCtx = createContext<Ctx | null>(null);

export function TransicaoFiltros({ children }: { children: ReactNode }) {
  const valor = useNavegacaoFiltros();
  return <TransicaoCtx.Provider value={valor}>{children}</TransicaoCtx.Provider>;
}

/** Área do relatório: esmaece enquanto os filtros novos carregam. */
export function AreaRelatorio({ children }: { children: ReactNode }) {
  const pendente = useContext(TransicaoCtx)?.pendente ?? false;
  return (
    <div
      aria-busy={pendente}
      className={cn(
        "space-y-6 transition-opacity duration-150",
        pendente && "pointer-events-none opacity-50",
      )}
    >
      {children}
    </div>
  );
}

/**
 * Usado pelos filtros. Dentro de <TransicaoFiltros> compartilha a transição
 * com a área do relatório; fora dele (ex.: /meu-desempenho) funciona sozinho.
 */
export function useFiltrosRelatorio(): Ctx {
  const ctx = useContext(TransicaoCtx);
  const proprio = useNavegacaoFiltros();
  return ctx ?? proprio;
}

function useNavegacaoFiltros(): Ctx {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendente, startTransition] = useTransition();
  const [qs, setQs] = useOptimistic(params.toString());

  return {
    query: new URLSearchParams(qs),
    pendente,
    navegar(next) {
      const s = next.toString();
      startTransition(() => {
        setQs(s);
        router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
      });
    },
  };
}
