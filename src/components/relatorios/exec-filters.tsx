"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPARACAO_LABEL,
  COMPARACAO_MODES,
  PERIODO_LABEL,
  type ComparacaoMode,
  type PeriodoPreset,
} from "@/lib/validators/report";

// Subset de presets focados em comparação executiva
const PRESETS_EXEC: PeriodoPreset[] = [
  "mes_atual",
  "mes_anterior",
  "trimestre",
  "ano",
  "ultimos_12m",
  "custom",
];

export function ExecFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const periodo = (params.get("periodo") as PeriodoPreset) ?? "mes_atual";
  const comparar =
    (params.get("comparar") as ComparacaoMode) ?? "anterior_equivalente";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "") next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Período</Label>
        <Select
          value={periodo}
          onValueChange={(v) => setParam("periodo", v ?? "mes_atual")}
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
            {PRESETS_EXEC.map((p) => (
              <SelectItem key={p} value={p}>
                {PERIODO_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Comparar com</Label>
        <Select
          value={comparar}
          onValueChange={(v) =>
            setParam("comparar", v ?? "anterior_equivalente")
          }
        >
          <SelectTrigger className="min-w-[220px]">
            <SelectValue>
              {(v: unknown) =>
                typeof v === "string"
                  ? COMPARACAO_LABEL[v as ComparacaoMode] ?? v
                  : null
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COMPARACAO_MODES.map((m) => (
              <SelectItem key={m} value={m}>
                {COMPARACAO_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
