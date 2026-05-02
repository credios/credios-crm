"use client";

import { ChevronDown, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
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
  consultores: { id: string; nome: string }[];
  origens: string[];
  ufs?: string[];
  /** Esconde filtro de consultor (página /meu-desempenho onde escopo é fixo). */
  hideConsultor?: boolean;
  /** Esconde faixa de valor (página marketing). */
  hideFaixaValor?: boolean;
};

export function ReportFilters({
  consultores,
  origens,
  ufs = [],
  hideConsultor,
  hideFaixaValor,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const periodo = (params.get("periodo") as PeriodoPreset) ?? "30d";
  const dataDe = params.get("dataDe") ?? "";
  const dataAte = params.get("dataAte") ?? "";

  const consultorIds = parseList(params.get("consultorIds"));
  const origensSel = parseList(params.get("origens"));
  const ufsSel = parseList(params.get("ufs"));
  const valorMin = params.get("valorMinCentavos") ?? "";
  const valorMax = params.get("valorMaxCentavos") ?? "";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "") next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function toggleInList(key: string, current: string[], item: string) {
    const set = new Set(current);
    if (set.has(item)) set.delete(item);
    else set.add(item);
    setParam(key, Array.from(set).join(",") || null);
  }

  function setMoneyInput(key: string, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return setParam(key, null);
    // Input em reais → converter pra centavos
    setParam(key, String(Number(digits) * 100));
  }

  const hasAnyFilter =
    periodo !== "30d" ||
    consultorIds.length > 0 ||
    origensSel.length > 0 ||
    ufsSel.length > 0 ||
    !!valorMin ||
    !!valorMax;

  function clearAll() {
    startTransition(() => router.replace(pathname));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
      <FilterField label="Período">
        <Select
          value={periodo}
          onValueChange={(v) => setParam("periodo", v ?? "30d")}
        >
          <SelectTrigger className="min-w-[170px]">
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
      </FilterField>

      {periodo === "custom" && (
        <>
          <FilterField label="De">
            <Input
              type="date"
              value={dataDe}
              onChange={(e) => setParam("dataDe", e.currentTarget.value || null)}
              className="min-w-[140px]"
            />
          </FilterField>
          <FilterField label="Até">
            <Input
              type="date"
              value={dataAte}
              onChange={(e) =>
                setParam("dataAte", e.currentTarget.value || null)
              }
              className="min-w-[140px]"
            />
          </FilterField>
        </>
      )}

      {!hideConsultor && consultores.length > 0 && (
        <FilterField label="Consultor">
          <MultiSelectButton
            label={
              consultorIds.length === 0
                ? "Todos"
                : consultorIds.length === 1
                  ? consultores.find((c) => c.id === consultorIds[0])?.nome ??
                    "1 selecionado"
                  : `${consultorIds.length} selecionados`
            }
          >
            <DropdownMenuLabel>Consultores</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {consultores.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={consultorIds.includes(c.id)}
                onCheckedChange={() =>
                  toggleInList("consultorIds", consultorIds, c.id)
                }
              >
                {c.nome}
              </DropdownMenuCheckboxItem>
            ))}
          </MultiSelectButton>
        </FilterField>
      )}

      {origens.length > 0 && (
        <FilterField label="Origem">
          <MultiSelectButton
            label={
              origensSel.length === 0
                ? "Todas"
                : origensSel.length === 1
                  ? origensSel[0]!
                  : `${origensSel.length} selecionadas`
            }
          >
            <DropdownMenuLabel>Origens</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {origens.map((o) => (
              <DropdownMenuCheckboxItem
                key={o}
                checked={origensSel.includes(o)}
                onCheckedChange={() => toggleInList("origens", origensSel, o)}
              >
                {o}
              </DropdownMenuCheckboxItem>
            ))}
          </MultiSelectButton>
        </FilterField>
      )}

      {ufs.length > 0 && (
        <FilterField label="UF">
          <MultiSelectButton
            label={
              ufsSel.length === 0
                ? "Todas"
                : ufsSel.length === 1
                  ? ufsSel[0]!
                  : `${ufsSel.length} selecionadas`
            }
          >
            <DropdownMenuLabel>Estados</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="grid grid-cols-3 gap-x-2 px-1">
              {ufs.map((uf) => (
                <DropdownMenuCheckboxItem
                  key={uf}
                  checked={ufsSel.includes(uf)}
                  onCheckedChange={() => toggleInList("ufs", ufsSel, uf)}
                >
                  {uf}
                </DropdownMenuCheckboxItem>
              ))}
            </div>
          </MultiSelectButton>
        </FilterField>
      )}

      {!hideFaixaValor && (
        <FilterField label="Valor R$ (mín / máx)">
          <div className="flex items-center gap-1.5">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Min"
              value={
                valorMin
                  ? Number(Math.round(Number(valorMin) / 100)).toLocaleString(
                      "pt-BR",
                    )
                  : ""
              }
              onChange={(e) =>
                setMoneyInput("valorMinCentavos", e.currentTarget.value)
              }
              className="min-w-[100px] font-mono"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Max"
              value={
                valorMax
                  ? Number(Math.round(Number(valorMax) / 100)).toLocaleString(
                      "pt-BR",
                    )
                  : ""
              }
              onChange={(e) =>
                setMoneyInput("valorMaxCentavos", e.currentTarget.value)
              }
              className="min-w-[100px] font-mono"
            />
          </div>
        </FilterField>
      )}

      {hasAnyFilter && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="self-end">
          <X className="size-3.5" /> Limpar
        </Button>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function MultiSelectButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 min-w-[150px] justify-between">
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px] max-h-[320px] overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").filter(Boolean);
}
