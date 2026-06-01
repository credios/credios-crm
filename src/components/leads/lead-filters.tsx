"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Switch } from "@/components/ui/switch";
import { STATUS_LEAD_LABEL, UFS } from "@/lib/constants";
import { CHANNELS } from "@/lib/tracking/taxonomy";

const STATUS_VALUES = Object.keys(STATUS_LEAD_LABEL);
const DISPOSITIVOS = ["Mobile", "Desktop", "Tablet"];

type Props = {
  consultores: { id: string; nome: string }[];
  /** Sources ativos do DB (vem do server component pai). */
  sources?: Array<{ source: string; channel: string; displayName: string }>;
};

export function LeadFilters({ consultores, sources = [] }: Props) {
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

  // Filtro hierárquico: Channel filtra os sources visíveis dentro do dropdown
  // de Source. Ex.: selecionando "Paid Social" mostra só Meta Ads, TikTok Ads,
  // etc — não polui o select com Google Ads, ChatGPT, Direct.
  const selectedChannel = params.get("channel");
  const sourcesForChannel = selectedChannel
    ? sources.filter((s) => s.channel === selectedChannel)
    : sources;
  // Channels disponíveis: só os que têm pelo menos 1 source ativo.
  const channelsAvailable = Array.from(
    new Set(sources.map((s) => s.channel)),
  ).sort(
    (a, b) =>
      (CHANNELS as readonly string[]).indexOf(a) -
      (CHANNELS as readonly string[]).indexOf(b),
  );
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
        <StatusMultiFilter
          selected={parseList(params.get("status"))}
          onChange={(next) => setParam("status", next.join(",") || null)}
          options={STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LEAD_LABEL[s] }))}
        />
        <FilterSelect
          label="Consultor"
          value={params.get("consultorId")}
          onChange={(v) => setParam("consultorId", v)}
          // Sentinela "__none__" pra filtrar leads sem consultor (pool não-
          // atribuído). Tratado em list-leads.ts → isNull(consultorId).
          options={[
            { value: "__none__", label: "Sem consultor (pool)" },
            ...consultores.map((c) => ({ value: c.id, label: c.nome })),
          ]}
        />
        <FilterSelect
          label="Canal"
          value={params.get("channel")}
          onChange={(v) => {
            setParam("channel", v);
            // Se trocou de canal e a fonte selecionada não pertence ao novo
            // canal, limpa a fonte (senão fica filtrando "Paid Search +
            // ChatGPT" que nunca retorna nada). Se a fonte ainda pertence
            // ao novo canal, mantém. Permite usar canal SEM fonte (que
            // mostra todos os sources daquele canal) ou COM fonte específica.
            const currentSource =
              params.get("source") ?? params.get("origem");
            if (v && currentSource) {
              const stillValid = sources.some(
                (s) => s.source === currentSource && s.channel === v,
              );
              if (!stillValid) {
                setParam("source", null);
                setParam("origem", null);
              }
            }
          }}
          options={channelsAvailable.map((c) => ({ value: c, label: c }))}
        />
        <FilterSelect
          label="Fonte"
          value={params.get("source") ?? params.get("origem")}
          onChange={(v) => {
            setParam("source", v);
            // Mantém `origem` sincronizado por compatibilidade com listagens
            // legadas que ainda filtram por leads.origem.
            setParam("origem", v);
            // Selecionar uma fonte auto-preenche o canal correspondente
            // (UX intuitiva: usuário vê o canal sem precisar selecionar de novo).
            if (v) {
              const matched = sources.find((s) => s.source === v);
              if (matched && matched.channel !== params.get("channel")) {
                setParam("channel", matched.channel);
              }
            }
          }}
          options={sourcesForChannel.map((s) => ({
            value: s.source,
            label: s.displayName,
          }))}
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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <Switch
              checked={params.get("incluirFechados") === "1"}
              onCheckedChange={(v) =>
                setParam("incluirFechados", v ? "1" : null)
              }
              aria-label="Mostrar leads fechados"
            />
            <span className="text-xs text-muted-foreground">
              Mostrar fechados
            </span>
          </label>
        </div>

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

/**
 * Filtro de Status com MÚLTIPLA seleção (marca quantos quiser). Mesmo visual
 * dos outros filtros (label + trigger bordado), mas abre um menu de checkboxes.
 * Sincroniza com a URL como lista separada por vírgula (?status=a,b,c).
 */
function StatusMultiFilter({
  selected,
  onChange,
  options,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  options: { value: string; label: string }[];
}) {
  const triggerLabel =
    selected.length === 0
      ? "Todos"
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selecionados`;

  function toggle(value: string) {
    const set = new Set(selected);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange(Array.from(set));
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Status</Label>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50">
          <span className={`truncate ${selected.length === 0 ? "text-muted-foreground" : ""}`}>
            {triggerLabel}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px] max-h-[320px] overflow-y-auto">
          {selected.length > 0 && (
            <>
              <DropdownMenuItem onClick={() => onChange([])}>
                Limpar status
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={selected.includes(o.value)}
              onCheckedChange={() => toggle(o.value)}
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function parseList(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").filter(Boolean);
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
