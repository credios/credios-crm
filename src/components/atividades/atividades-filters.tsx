"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

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
  PERIODO_LABELS,
  type AtividadesFilters as Filters,
  type AtividadesPeriodo,
} from "@/lib/atividades/filters";
import {
  ATIVIDADE_TIPO_LABEL,
  ATIVIDADE_TIPOS,
} from "@/lib/atividades/types";

type Props = {
  consultores: { id: string; nome: string }[];
  filters: Filters;
};

const PERIODO_VALUES: AtividadesPeriodo[] = [
  "hoje",
  "ontem",
  "semana",
  "30d",
  "mes",
  "personalizado",
];

export function AtividadesFilters({ consultores, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [dataDe, setDataDe] = useState(filters.dataDe ?? "");
  const [dataAte, setDataAte] = useState(filters.dataAte ?? "");

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  function setMultiParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  function applyCustomRange() {
    if (!dataDe || !dataAte) return;
    setMultiParams({
      periodo: "personalizado",
      dataDe,
      dataAte,
    });
  }

  function clearAll() {
    startTransition(() => router.replace(pathname));
  }

  const hasFilters =
    filters.periodo !== "hoje" ||
    !!filters.consultorId ||
    (!!filters.tipo && filters.tipo !== "__all__");

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Período</Label>
          <Select
            value={filters.periodo}
            onValueChange={(v) => {
              if (v === "personalizado") {
                // Inicializa input com hoje pra dar UX mínima
                const today = new Date().toISOString().slice(0, 10);
                setDataDe(today);
                setDataAte(today);
                setParam("periodo", "personalizado");
              } else {
                setMultiParams({
                  periodo: v ?? "hoje",
                  dataDe: null,
                  dataAte: null,
                });
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODO_VALUES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIODO_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Consultor</Label>
          <Select
            value={filters.consultorId ?? "__all__"}
            onValueChange={(v) => setParam("consultorId", v === "__all__" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue>
                {(v: unknown) => {
                  if (typeof v !== "string" || v === "__all__") {
                    return <span className="text-muted-foreground">Todos</span>;
                  }
                  return (
                    consultores.find((c) => c.id === v)?.nome ?? "Desconhecido"
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {consultores.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select
            value={filters.tipo ?? "__all__"}
            onValueChange={(v) => setParam("tipo", v === "__all__" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue>
                {(v: unknown) => {
                  if (typeof v !== "string" || v === "__all__") {
                    return <span className="text-muted-foreground">Todos</span>;
                  }
                  return ATIVIDADE_TIPO_LABEL[v as keyof typeof ATIVIDADE_TIPO_LABEL] ?? v;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {ATIVIDADE_TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {ATIVIDADE_TIPO_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              className="h-9 w-full gap-1.5"
            >
              <X className="size-3.5" /> Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {filters.periodo === "personalizado" && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end rounded-md border bg-muted/30 p-2.5">
          <div className="space-y-1">
            <Label htmlFor="dataDe" className="text-xs">
              De
            </Label>
            <Input
              id="dataDe"
              type="date"
              value={dataDe}
              onChange={(e) => setDataDe(e.currentTarget.value)}
              max={dataAte || undefined}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dataAte" className="text-xs">
              Até
            </Label>
            <Input
              id="dataAte"
              type="date"
              value={dataAte}
              onChange={(e) => setDataAte(e.currentTarget.value)}
              min={dataDe || undefined}
            />
          </div>
          <Button onClick={applyCustomRange} disabled={!dataDe || !dataAte}>
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}
