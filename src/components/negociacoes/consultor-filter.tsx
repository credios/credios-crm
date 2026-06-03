"use client";

import { Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  consultores: { id: string; nome: string }[];
  /** "meus" | "todos" | <consultorId> */
  value: string;
};

export function ConsultorFilter({ consultores, value }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function setConsultor(v: string) {
    const next = new URLSearchParams(params.toString());
    if (!v || v === "meus") next.delete("consultor");
    else next.set("consultor", v);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <div className="flex items-center gap-2">
      <Users className="size-4 text-muted-foreground" strokeWidth={1.75} />
      <Select value={value} onValueChange={(v) => setConsultor(v ?? "meus")}>
        <SelectTrigger className="h-9 w-auto min-w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="meus">Minhas negociações</SelectItem>
          <SelectItem value="todos">Todos os consultores</SelectItem>
          {consultores.length > 0 && <SelectSeparator />}
          {consultores.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
