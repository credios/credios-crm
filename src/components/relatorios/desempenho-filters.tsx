"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERIODO_LABEL,
  PERIODO_PRESETS,
  type PeriodoPreset,
} from "@/lib/validators/report";

type Props = {
  origens: string[];
  /** Quando true, mostra também inputs de data custom. */
  showCustom?: boolean;
};

export function DesempenhoFilters({ origens }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const periodo = (params.get("periodo") as PeriodoPreset) ?? "30d";
  const dataDe = params.get("dataDe") ?? "";
  const dataAte = params.get("dataAte") ?? "";
  const origensSelecionadas = (params.get("origens") ?? "")
    .split(",")
    .filter(Boolean);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "") next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function toggleOrigem(o: string) {
    const set = new Set(origensSelecionadas);
    if (set.has(o)) set.delete(o);
    else set.add(o);
    setParam("origens", Array.from(set).join(","));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Período</Label>
        <Select
          value={periodo}
          onValueChange={(v) => setParam("periodo", v ?? "30d")}
        >
          <SelectTrigger className="min-w-[180px]">
            <SelectValue>
              {(v: unknown) =>
                typeof v === "string"
                  ? PERIODO_LABEL[v as PeriodoPreset] ?? v
                  : null
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PERIODO_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {PERIODO_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {periodo === "custom" && (
        <div className="flex gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              value={dataDe}
              onChange={(e) => setParam("dataDe", e.currentTarget.value || null)}
              className="min-w-[140px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              value={dataAte}
              onChange={(e) =>
                setParam("dataAte", e.currentTarget.value || null)
              }
              className="min-w-[140px]"
            />
          </div>
        </div>
      )}

      {origens.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Origem</Label>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm h-8 hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
              {origensSelecionadas.length === 0
                ? "Todas"
                : origensSelecionadas.length === 1
                  ? origensSelecionadas[0]
                  : `${origensSelecionadas.length} selecionadas`}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuLabel>Origens</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {origens.map((o) => (
                <DropdownMenuCheckboxItem
                  key={o}
                  checked={origensSelecionadas.includes(o)}
                  onCheckedChange={() => toggleOrigem(o)}
                >
                  {o}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
