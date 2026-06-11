"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BANCOS_PARCEIROS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const PRESETS = new Set<string>(BANCOS_PARCEIROS);
const MAX_BANCO_LEN = 80; // espelha o limite do updateStatusSchema (bancos)

/**
 * Seletor de bancos: grade dos parceiros pré-listados + "Outros" com campo
 * livre para bancos e fundos de investimento fora da lista. As entradas
 * customizadas viram chips removíveis e entram na MESMA seleção dos presets
 * (o caller continua lidando só com um Set<string>).
 */
export function BancosPicker({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (banco: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const customSelecionados = Array.from(selected).filter((b) => !PRESETS.has(b));

  function addCustom() {
    const nome = custom.trim().replace(/\s+/g, " ").slice(0, MAX_BANCO_LEN);
    if (!nome) return;
    // Se digitou um preset (qualquer caixa), só marca o preset.
    const preset = BANCOS_PARCEIROS.find(
      (b) => b.toLowerCase() === nome.toLowerCase(),
    );
    const canonical =
      preset ??
      Array.from(selected).find((b) => b.toLowerCase() === nome.toLowerCase()) ??
      nome;
    if (!selected.has(canonical)) onToggle(canonical);
    setCustom("");
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {BANCOS_PARCEIROS.map((banco) => {
          const active = selected.has(banco);
          return (
            <button
              key={banco}
              type="button"
              onClick={() => onToggle(banco)}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted",
              )}
            >
              {banco}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="banco-outros">Outros (banco ou fundo não listado)</Label>
        <div className="flex gap-2">
          <Input
            id="banco-outros"
            value={custom}
            maxLength={MAX_BANCO_LEN}
            placeholder="Ex.: Fundo XPTO Capital"
            onChange={(e) => setCustom(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addCustom}
            disabled={!custom.trim()}
          >
            <Plus className="size-4" />
            Adicionar
          </Button>
        </div>
      </div>

      {customSelecionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customSelecionados.map((banco) => (
            <button
              key={banco}
              type="button"
              onClick={() => onToggle(banco)}
              title="Remover"
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {banco}
              <X className="size-3" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
