"use client";

import { Input } from "@/components/ui/input";

// Campos com máscara do portal. O valor guardado é sempre "limpo" (só
// dígitos); a formatação é só o que aparece.

/** Reais inteiros com separador de milhar: digita 300000, vê "300.000". */
export function InputReais({
  id,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id?: string;
  /** Só dígitos (reais inteiros). */
  value: string;
  onChange: (digitos: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const exibido = value ? Number(value).toLocaleString("pt-BR") : "";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
        R$
      </span>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        className="pl-9 tabular-nums"
        placeholder={placeholder}
        value={exibido}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12))}
      />
    </div>
  );
}

/** (47) 99999-0000 */
export function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
