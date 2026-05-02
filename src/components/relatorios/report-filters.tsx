"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

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
import { PERIODO_LABEL, PERIODO_PRESETS } from "@/lib/validators/report";

type Props = {
  consultores: { id: string; nome: string }[];
  origens: string[];
};

export function ReportFilters({ consultores, origens }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const periodo = params.get("periodo") ?? "30d";
  const isCustom = periodo === "custom";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "") next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function clearAll() {
    startTransition(() => router.replace(pathname));
  }

  const hasFilters = ["periodo", "dataDe", "dataAte", "origem", "consultorId"].some(
    (k) => params.has(k),
  );

  return (
    <div className="space-y-3 rounded-md border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Período</Label>
          <Select value={periodo} onValueChange={(v) => setParam("periodo", v ?? null)}>
            <SelectTrigger>
              <SelectValue>
                {(v: unknown) => {
                  const k = typeof v === "string" ? v : "30d";
                  return PERIODO_LABEL[k as keyof typeof PERIODO_LABEL] ?? k;
                }}
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

        <div className="space-y-1.5">
          <Label className="text-xs">Consultor</Label>
          <Select
            value={params.get("consultorId") ?? "__all__"}
            onValueChange={(v) =>
              setParam("consultorId", v === "__all__" ? null : (v ?? null))
            }
          >
            <SelectTrigger>
              <SelectValue>
                {(v: unknown) => {
                  if (typeof v !== "string" || !v || v === "__all__") {
                    return <span className="text-muted-foreground">Todos</span>;
                  }
                  return consultores.find((c) => c.id === v)?.nome ?? v;
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
          <Label className="text-xs">Origem</Label>
          <Select
            value={params.get("origem") ?? "__all__"}
            onValueChange={(v) =>
              setParam("origem", v === "__all__" ? null : (v ?? null))
            }
          >
            <SelectTrigger>
              <SelectValue>
                {(v: unknown) => {
                  if (typeof v !== "string" || !v || v === "__all__") {
                    return <span className="text-muted-foreground">Todas</span>;
                  }
                  return v;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {origens.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCustom && (
          <div className="space-y-1.5">
            <Label className="text-xs">Datas (custom)</Label>
            <div className="flex gap-1">
              <Input
                type="date"
                value={params.get("dataDe") ?? ""}
                onChange={(e) => setParam("dataDe", e.currentTarget.value || null)}
              />
              <Input
                type="date"
                value={params.get("dataAte") ?? ""}
                onChange={(e) => setParam("dataAte", e.currentTarget.value || null)}
              />
            </div>
          </div>
        )}
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="size-3.5" /> Limpar filtros
        </Button>
      )}
    </div>
  );
}
