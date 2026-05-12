"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TIPOS_IMOVEL, UFS } from "@/lib/constants";
import { CANONICAL_SOURCES } from "@/lib/tracking/taxonomy";

// Lista de sources usada nas condições de roteamento. Vem da taxonomia
// canônica em vez do enum ORIGENS legado — alinha com tracking_sources.
const ORIGENS_AVAILABLE = CANONICAL_SOURCES.map((s) => s.source);
import type { RuleCondicoes } from "@/lib/routing/types";
import { cn } from "@/lib/utils";

const TIPOS_CONDICAO = [
  { key: "valor_credito_min", label: "Valor crédito mínimo (R$)", kind: "money" },
  { key: "valor_credito_max", label: "Valor crédito máximo (R$)", kind: "money" },
  { key: "valor_imovel_min", label: "Valor imóvel mínimo (R$)", kind: "money" },
  { key: "valor_imovel_max", label: "Valor imóvel máximo (R$)", kind: "money" },
  { key: "estado_in", label: "Estado (UFs permitidas)", kind: "uf_multi" },
  { key: "origem_in", label: "Origem (lista permitida)", kind: "origem_multi" },
  { key: "tipo_imovel_in", label: "Tipo de imóvel (lista permitida)", kind: "tipo_multi" },
  { key: "horario_comercial", label: "Apenas em horário comercial", kind: "bool" },
] as const;

type CondKey = (typeof TIPOS_CONDICAO)[number]["key"];

type Props = {
  value: RuleCondicoes;
  onChange: (next: RuleCondicoes) => void;
  disabled?: boolean;
};

export function ConditionsEditor({ value, onChange, disabled }: Props) {
  const activeKeys = TIPOS_CONDICAO.filter((t) => value[t.key] !== undefined).map(
    (t) => t.key,
  );
  const availableKeys = TIPOS_CONDICAO.filter(
    (t) => !activeKeys.includes(t.key),
  );

  function setCondition(key: CondKey, v: unknown) {
    onChange({ ...value, [key]: v });
  }

  function removeCondition(key: CondKey) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }

  function addCondition(key: CondKey) {
    const def = defaultValueFor(key);
    onChange({ ...value, [key]: def });
  }

  return (
    <div className="space-y-3">
      {activeKeys.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          Nenhuma condição — esta regra bate com qualquer lead (use só como fallback no fundo da pilha).
        </p>
      )}

      {activeKeys.map((key) => {
        const meta = TIPOS_CONDICAO.find((t) => t.key === key)!;
        return (
          <div
            key={key}
            className="rounded-md border bg-muted/30 p-3 space-y-2 relative"
          >
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">{meta.label}</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeCondition(key)}
                disabled={disabled}
                aria-label="Remover condição"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            {renderEditor(key, value[key], (v) => setCondition(key, v), disabled)}
          </div>
        );
      })}

      {availableKeys.length > 0 && (
        <div className="flex gap-2">
          <Select
            value=""
            onValueChange={(v) => v && addCondition(v as CondKey)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="+ Adicionar condição" />
            </SelectTrigger>
            <SelectContent>
              {availableKeys.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function defaultValueFor(key: CondKey): unknown {
  switch (key) {
    case "valor_credito_min":
    case "valor_credito_max":
    case "valor_imovel_min":
    case "valor_imovel_max":
      return 0;
    case "estado_in":
    case "origem_in":
    case "tipo_imovel_in":
      return [];
    case "horario_comercial":
      return true;
  }
}

function renderEditor(
  key: CondKey,
  value: unknown,
  onChange: (v: unknown) => void,
  disabled?: boolean,
) {
  switch (key) {
    case "valor_credito_min":
    case "valor_credito_max":
    case "valor_imovel_min":
    case "valor_imovel_max": {
      const cents = typeof value === "number" ? value : 0;
      const reais = cents / 100;
      return (
        <Input
          type="number"
          step="0.01"
          min="0"
          value={reais}
          disabled={disabled}
          onChange={(e) => {
            const r = Number(e.currentTarget.value);
            onChange(Math.round((Number.isFinite(r) ? r : 0) * 100));
          }}
        />
      );
    }
    case "estado_in":
      return (
        <CheckboxList
          options={UFS as readonly string[]}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange as (v: string[]) => void}
          disabled={disabled}
          gridClassName="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-2"
        />
      );
    case "origem_in":
      return (
        <CheckboxList
          options={ORIGENS_AVAILABLE}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange as (v: string[]) => void}
          disabled={disabled}
          gridClassName="grid grid-cols-2 sm:grid-cols-3 gap-2"
        />
      );
    case "tipo_imovel_in":
      return (
        <CheckboxList
          options={TIPOS_IMOVEL as readonly string[]}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange as (v: string[]) => void}
          disabled={disabled}
          gridClassName="grid grid-cols-2 sm:grid-cols-3 gap-2"
        />
      );
    case "horario_comercial":
      return (
        <div className="flex items-center gap-3">
          <Switch
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">
            {value === true ? "Apenas dentro" : "Apenas fora"} de 08-18 BRT seg-sex
          </span>
        </div>
      );
  }
}

function CheckboxList({
  options,
  value,
  onChange,
  disabled,
  gridClassName,
}: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  gridClassName?: string;
}) {
  function toggle(opt: string, checked: boolean) {
    if (checked) onChange(Array.from(new Set([...value, opt])));
    else onChange(value.filter((v) => v !== opt));
  }
  return (
    <div className={cn(gridClassName)}>
      {options.map((opt) => {
        const checked = value.includes(opt);
        return (
          <label
            key={opt}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => toggle(opt, v === true)}
              disabled={disabled}
            />
            {opt}
          </label>
        );
      })}
    </div>
  );
}
