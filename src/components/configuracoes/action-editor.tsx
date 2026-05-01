"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AcaoTipo } from "@/lib/routing/types";

export type AcaoState = {
  acao: AcaoTipo;
  parametros: Record<string, unknown>;
};

type Props = {
  value: AcaoState;
  onChange: (v: AcaoState) => void;
  usuarios: { id: string; nome: string; perfil: string }[];
  disabled?: boolean;
};

export function ActionEditor({ value, onChange, usuarios, disabled }: Props) {
  function setAcao(novo: AcaoTipo) {
    let parametros: Record<string, unknown> = {};
    if (novo === "atribuir_usuario") parametros = { usuario_id: "" };
    if (novo === "round_robin_grupo") parametros = { grupo_usuarios: [] };
    onChange({ acao: novo, parametros });
  }

  return (
    <div className="space-y-4">
      <RadioGroup
        value={value.acao}
        onValueChange={(v) => v && setAcao(v as AcaoTipo)}
        disabled={disabled}
        className="grid gap-2 sm:grid-cols-3"
      >
        <ActionOption value="atribuir_usuario" label="Atribuir a um usuário" />
        <ActionOption value="round_robin_grupo" label="Round-robin entre um grupo" />
        <ActionOption value="pool_nao_atribuido" label="Deixar no pool" />
      </RadioGroup>

      {value.acao === "atribuir_usuario" && (
        <div className="space-y-1.5">
          <Label>Usuário responsável</Label>
          <Select
            value={(value.parametros.usuario_id as string) || ""}
            onValueChange={(v) =>
              onChange({ ...value, parametros: { usuario_id: v ?? "" } })
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um usuário…" />
            </SelectTrigger>
            <SelectContent>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome} <span className="text-muted-foreground text-xs">({u.perfil})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.acao === "round_robin_grupo" && (
        <div className="space-y-2">
          <Label>Grupo (round-robin segue a ordem da lista de usuários ativos)</Label>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 rounded-md border bg-muted/30 p-3">
            {usuarios.map((u) => {
              const grupo = (value.parametros.grupo_usuarios as string[]) ?? [];
              const checked = grupo.includes(u.id);
              return (
                <label
                  key={u.id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const isCheck = v === true;
                      const novoGrupo = isCheck
                        ? Array.from(new Set([...grupo, u.id]))
                        : grupo.filter((id) => id !== u.id);
                      onChange({
                        ...value,
                        parametros: { grupo_usuarios: novoGrupo },
                      });
                    }}
                    disabled={disabled}
                  />
                  {u.nome}
                  <span className="text-xs text-muted-foreground">({u.perfil})</span>
                </label>
              );
            })}
          </div>
          {(value.parametros.grupo_usuarios as string[] | undefined)?.length === 0 && (
            <p className="text-xs text-destructive">Selecione pelo menos 1 usuário.</p>
          )}
        </div>
      )}

      {value.acao === "pool_nao_atribuido" && (
        <p className="text-sm text-muted-foreground">
          Lead permanecerá sem atribuição. Admin atribui manualmente depois.
        </p>
      )}
    </div>
  );
}

function ActionOption({ value, label }: { value: AcaoTipo; label: string }) {
  return (
    <label className="flex items-center gap-2 rounded-md border p-3 cursor-pointer has-[input:checked]:border-foreground has-[input:checked]:bg-accent/50">
      <RadioGroupItem value={value} />
      <span className="text-sm">{label}</span>
    </label>
  );
}
