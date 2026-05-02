"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

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
import { Switch } from "@/components/ui/switch";
import { ORIGENS, STATUS_LEAD_LABEL, UFS } from "@/lib/constants";

const STATUS_VALUES = Object.keys(STATUS_LEAD_LABEL);
const DISPOSITIVOS = ["Mobile", "Desktop", "Tablet"];

type Props = {
  consultores: { id: string; nome: string }[];
  origens?: string[];
};

export function LeadFilters({ consultores, origens }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const currentQ = params.get("q") ?? "";
  const [q, setQ] = useState(currentQ);
  const [syncedQ, setSyncedQ] = useState(currentQ);

  // Estado local pros campos de data — sem isso, cada keystroke disparava
  // setParam, mudava URL, re-renderizava input com data parcial inválida
  // (ex: ano "0002" enquanto user digita "2026") e o cursor "resetava".
  // Agora o input mantém o que o user digitou; só aplica na URL após
  // debounce E quando a data é válida (ano com 4 dígitos entre 1900-2100).
  const currentDataDe = params.get("dataDe") ?? "";
  const currentDataAte = params.get("dataAte") ?? "";
  const [dataDe, setDataDe] = useState(currentDataDe);
  const [dataAte, setDataAte] = useState(currentDataAte);
  const [syncedDataDe, setSyncedDataDe] = useState(currentDataDe);
  const [syncedDataAte, setSyncedDataAte] = useState(currentDataAte);

  // Sync render-time: se URL mudou externamente (clearAll, navegação),
  // re-sincroniza estado local. Padrão "controlled-from-URL".
  if (syncedQ !== currentQ) {
    setSyncedQ(currentQ);
    if (q !== currentQ) setQ(currentQ);
  }
  if (syncedDataDe !== currentDataDe) {
    setSyncedDataDe(currentDataDe);
    if (dataDe !== currentDataDe) setDataDe(currentDataDe);
  }
  if (syncedDataAte !== currentDataAte) {
    setSyncedDataAte(currentDataAte);
    if (dataAte !== currentDataAte) setDataAte(currentDataAte);
  }

  // Debounce search → atualiza URL.
  useEffect(() => {
    if (q === currentQ) return;
    const t = setTimeout(() => {
      setParam("q", q || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, currentQ]);

  // Debounce data → só aplica se válida. Evita resetar input enquanto user
  // digita "2026" (parsing parcial criaria ano "0002" e travava o cursor).
  useEffect(() => {
    if (dataDe === currentDataDe) return;
    if (!isValidDateOrEmpty(dataDe)) return;
    const t = setTimeout(() => setParam("dataDe", dataDe || null), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataDe, currentDataDe]);

  useEffect(() => {
    if (dataAte === currentDataAte) return;
    if (!isValidDateOrEmpty(dataAte)) return;
    const t = setTimeout(() => setParam("dataAte", dataAte || null), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataAte, currentDataAte]);

  function setParam(key: string, value: string | null) {
    const newParams = new URLSearchParams(params.toString());
    if (value && value !== "") newParams.set(key, value);
    else newParams.delete(key);
    if (key !== "page") newParams.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${newParams.toString()}`);
    });
  }

  function clearAll() {
    setQ("");
    setDataDe("");
    setDataAte("");
    startTransition(() => router.replace(pathname));
  }

  const origensList = origens && origens.length > 0 ? origens : ORIGENS;
  const hasFilters = Array.from(params.keys()).some(
    (k) => !["page", "pageSize"].includes(k),
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="Buscar por nome, email, CPF ou telefone…"
          className="pl-9"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <FilterSelect
          label="Status"
          value={params.get("status")}
          onChange={(v) => setParam("status", v)}
          options={STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LEAD_LABEL[s] }))}
        />
        <FilterSelect
          label="Consultor"
          value={params.get("consultorId")}
          onChange={(v) => setParam("consultorId", v)}
          options={consultores.map((c) => ({ value: c.id, label: c.nome }))}
        />
        <FilterSelect
          label="Origem"
          value={params.get("origem")}
          onChange={(v) => setParam("origem", v)}
          options={origensList.map((o) => ({ value: o, label: o }))}
        />
        <FilterSelect
          label="UF"
          value={params.get("estado")}
          onChange={(v) => setParam("estado", v)}
          options={UFS.map((u) => ({ value: u, label: u }))}
        />
        <FilterSelect
          label="Dispositivo"
          value={params.get("dispositivo")}
          onChange={(v) => setParam("dispositivo", v)}
          options={DISPOSITIVOS.map((d) => ({ value: d, label: d }))}
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Valor (R$)</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              min="0"
              placeholder="min"
              value={centsToReaisStr(params.get("valorMin"))}
              onChange={(e) => setParam("valorMin", reaisStrToCents(e.currentTarget.value))}
            />
            <Input
              type="number"
              min="0"
              placeholder="max"
              value={centsToReaisStr(params.get("valorMax"))}
              onChange={(e) => setParam("valorMax", reaisStrToCents(e.currentTarget.value))}
            />
          </div>
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label className="text-xs">Período (criado em)</Label>
          <div className="flex gap-1">
            <Input
              type="date"
              value={dataDe}
              onChange={(e) => setDataDe(e.currentTarget.value)}
              min="1900-01-01"
              max="2100-12-31"
            />
            <Input
              type="date"
              value={dataAte}
              onChange={(e) => setDataAte(e.currentTarget.value)}
              min="1900-01-01"
              max="2100-12-31"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <Switch
            checked={params.get("incluirEncerrados") === "1"}
            onCheckedChange={(v) =>
              setParam("incluirEncerrados", v ? "1" : null)
            }
            aria-label="Mostrar leads perdidos e desqualificados"
          />
          <span className="text-xs text-muted-foreground">
            Mostrar perdidos / desqualificados
          </span>
        </label>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="size-3.5" /> Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value ?? "__all__"}
        onValueChange={(v) => onChange(v === "__all__" ? null : (v ?? null))}
      >
        <SelectTrigger>
          <SelectValue>
            {(v: unknown) => {
              if (typeof v !== "string" || !v || v === "__all__") {
                return <span className="text-muted-foreground">Todos</span>;
              }
              return options.find((o) => o.value === v)?.label ?? v;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todos</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Aceita string vazia ou data ISO completa (YYYY-MM-DD) com ano plausível.
// Bloqueia ano <1900 (=> setParam não dispara enquanto user digita "2026" e
// passa por "0002", "0020", etc), e ano >2100 (proteção upper bound).
function isValidDateOrEmpty(v: string): boolean {
  if (v === "") return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const year = Number(m[1]);
  return year >= 1900 && year <= 2100;
}

function centsToReaisStr(cents: string | null): string {
  if (!cents) return "";
  const n = Number(cents);
  return Number.isFinite(n) ? String(n / 100) : "";
}

function reaisStrToCents(reais: string): string | null {
  const n = Number(reais);
  if (!reais || !Number.isFinite(n) || n < 0) return null;
  return String(Math.round(n * 100));
}
