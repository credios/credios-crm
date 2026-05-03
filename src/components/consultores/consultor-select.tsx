"use client";

import { ChevronDown, Users } from "lucide-react";
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
  consultores: { id: string; nome: string }[];
  currentId: string | null;
};

/**
 * Picker dedicado pra /admin/consultores — diferente do ConsultorPicker
 * de /meu-desempenho que tem o conceito de "você". Aqui admin não é
 * consultor, então só mostra a lista plana.
 */
export function ConsultorSelect({ consultores, currentId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const current = consultores.find((c) => c.id === currentId);

  function pick(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("id", id);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="group inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-elev-sm hover:border-foreground/20 hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 min-w-[240px]"
        aria-label="Selecionar consultor"
      >
        <Users className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">
          consultor
        </span>
        <span className="flex-1 text-left font-medium truncate">
          {current?.nome ?? "Selecione…"}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[260px]">
        <DropdownMenuLabel>Consultores ativos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {consultores.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            Nenhum consultor ativo.
          </div>
        )}
        {consultores.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => pick(c.id)}>
            <span className="flex-1">{c.nome}</span>
            {c.id === currentId && (
              <span className="font-mono text-[10px] text-primary">●</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
