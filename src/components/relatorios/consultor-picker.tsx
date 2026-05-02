"use client";

import { ChevronDown, Eye } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  /** Lista de consultores que podem ser visualizados (admin/gerente vê todos). */
  consultores: { id: string; nome: string }[];
  /** ID atualmente visualizado. Default: o próprio user. */
  currentId: string;
  /** ID do user logado (pra marcar "Você" no item correspondente). */
  selfId: string;
};

export function ConsultorPicker({ consultores, currentId, selfId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const current = consultores.find((c) => c.id === currentId);

  function pick(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id === selfId) {
      next.delete("consultor");
    } else {
      next.set("consultor", id);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="group inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm shadow-elev-sm hover:border-foreground/20 hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        aria-label="Selecionar consultor visualizado"
      >
        <Eye className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">
          ver de
        </span>
        <span className="font-medium">
          {current?.nome ?? "—"}
          {currentId === selfId && (
            <span className="ml-1 font-mono text-[10px] text-gold-700 dark:text-gold-400">
              (você)
            </span>
          )}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <DropdownMenuLabel>Consultor visualizado</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {consultores.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => pick(c.id)}>
            <span className="flex-1">{c.nome}</span>
            {c.id === selfId && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-gold-700 dark:text-gold-400">
                você
              </span>
            )}
            {c.id === currentId && c.id !== selfId && (
              <span className="font-mono text-[10px] text-primary">●</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
