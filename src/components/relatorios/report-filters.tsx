"use client";

import { ChevronDown, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  PRODUTO_LABEL_CURTO,
  PRODUTOS_ATIVOS,
  type Produto,
} from "@/lib/produtos";
import {
  PERIODO_LABEL,
  PERIODO_PRESETS,
  type PeriodoPreset,
} from "@/lib/validators/report";

import { useFiltrosRelatorio } from "./transicao-filtros";

type Props = {
  consultores: { id: string; nome: string }[];
  origens: string[];
  ufs?: string[];
  /** Esconde filtro de consultor (página /meu-desempenho onde escopo é fixo). */
  hideConsultor?: boolean;
};

export function ReportFilters({
  consultores,
  origens,
  ufs = [],
  hideConsultor,
}: Props) {
  // `params` é otimista: reflete o filtro escolhido no mesmo frame, antes da
  // página nova chegar do servidor (ver transicao-filtros.tsx).
  const { query: params, pendente, navegar } = useFiltrosRelatorio();

  const periodo = (params.get("periodo") as PeriodoPreset) ?? "30d";
  const dataDe = params.get("dataDe") ?? "";
  const dataAte = params.get("dataAte") ?? "";

  const consultorIds = parseList(params.get("consultorIds"));
  const origensSel = parseList(params.get("origens"));
  const ufsSel = parseList(params.get("ufs"));
  const produto = params.get("produto");
  const valorMin = params.get("valorMinCentavos") ?? "";
  const valorMax = params.get("valorMaxCentavos") ?? "";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "") next.set(key, value);
    else next.delete(key);
    navegar(next);
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
    !!produto ||
    !!valorMin ||
    !!valorMax;

  function clearAll() {
    navegar(new URLSearchParams());
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

      <FilterField label="Produto">
        <Select
          value={produto ?? "__all__"}
          onValueChange={(v) => setParam("produto", !v || v === "__all__" ? null : v)}
        >
          <SelectTrigger className="min-w-[140px]">
            <SelectValue>
              {(v: unknown) =>
                typeof v === "string" && v !== "__all__"
                  ? PRODUTO_LABEL_CURTO[v as Produto] ?? v
                  : "Todos"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {PRODUTOS_ATIVOS.map((p) => (
              <SelectItem key={p} value={p}>
                {PRODUTO_LABEL_CURTO[p]}
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

      <FilterField label="Valor R$ (mín / máx)">
        <div className="flex items-center gap-1.5">
            <MoneyInput
              placeholder="Min"
              centavos={valorMin}
              onCommit={(raw) => setMoneyInput("valorMinCentavos", raw)}
            />
            <span className="text-muted-foreground">–</span>
            <MoneyInput
              placeholder="Max"
              centavos={valorMax}
              onCommit={(raw) => setMoneyInput("valorMaxCentavos", raw)}
            />
        </div>
      </FilterField>

      {pendente && (
        <span
          role="status"
          className="flex items-center gap-1.5 self-end pb-1.5 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin" /> Atualizando…
        </span>
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

// Antes, cada tecla digitada no valor navegava e recalculava o relatório
// inteiro no servidor. Agora o campo é local e só aplica 600 ms depois da
// última tecla (ou ao sair do campo / Enter).
function MoneyInput({
  placeholder,
  centavos,
  onCommit,
}: {
  placeholder: string;
  centavos: string;
  onCommit: (raw: string) => void;
}) {
  const formatado = centavos
    ? Number(Math.round(Number(centavos) / 100)).toLocaleString("pt-BR")
    : "";
  const [texto, setTexto] = useState(formatado);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aplicado = useRef(formatado);

  // Filtro mudou por fora (ex.: "Limpar") → acompanha.
  useEffect(() => {
    aplicado.current = formatado;
    setTexto(formatado); // eslint-disable-line react-hooks/set-state-in-effect
  }, [formatado]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function aplicar(valor: string) {
    if (timer.current) clearTimeout(timer.current);
    const digitos = valor.replace(/\D/g, "");
    const atual = aplicado.current.replace(/\D/g, "");
    if (digitos === atual) return;
    aplicado.current = valor;
    onCommit(valor);
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={texto}
      onChange={(e) => {
        const v = e.currentTarget.value;
        setTexto(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => aplicar(v), 600);
      }}
      onBlur={(e) => aplicar(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") aplicar(e.currentTarget.value);
      }}
      className="min-w-[100px] font-mono"
    />
  );
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").filter(Boolean);
}
