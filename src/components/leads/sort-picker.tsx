"use client";

import { ArrowDownUp, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SORT_LEAD_KEYS, type SortLeadKey } from "@/lib/validators/lead";

const LABEL: Record<SortLeadKey, string> = {
  criado_em: "Criação",
  atualizado_em: "Última atualização",
  ultimo_contato: "Último contato",
  nome: "Nome",
  valor_credito: "Valor buscado",
  status: "Status",
  origem: "Origem",
};

/**
 * Direção default sugerida por chave (a maioria dos usuários quer "mais
 * recente / maior primeiro" pra datas e dinheiro, "A→Z" pra texto).
 */
const DEFAULT_DIR: Record<SortLeadKey, "asc" | "desc"> = {
  criado_em: "desc",
  atualizado_em: "desc",
  ultimo_contato: "desc",
  nome: "asc",
  valor_credito: "desc",
  status: "asc",
  origem: "asc",
};

export function SortPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const sortBy = (params.get("sortBy") as SortLeadKey) ?? "criado_em";
  const sortDir = (params.get("sortDir") as "asc" | "desc") ?? "desc";

  function setSort(by: SortLeadKey) {
    const next = new URLSearchParams(params.toString());
    next.set("sortBy", by);
    // Se trocar de chave, aplica a direção default da nova chave.
    if (by !== sortBy) next.set("sortDir", DEFAULT_DIR[by]);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function toggleDir() {
    const next = new URLSearchParams(params.toString());
    next.set("sortDir", sortDir === "asc" ? "desc" : "asc");
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  const DirIcon = sortDir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="font-medium">
              <ArrowDownUp className="size-3.5" /> Ordenar por:{" "}
              <span className="font-mono text-[11px] uppercase tracking-wider">
                {LABEL[sortBy]}
              </span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={sortBy}
            onValueChange={(v) => setSort((v ?? "criado_em") as SortLeadKey)}
          >
            {SORT_LEAD_KEYS.map((k) => (
              <DropdownMenuRadioItem key={k} value={k}>
                {LABEL[k]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleDir}>
            <DirIcon className="size-3.5" />
            Direção: {sortDir === "asc" ? "crescente" : "decrescente"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
