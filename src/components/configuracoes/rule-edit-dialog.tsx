"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ActionEditor, type AcaoState } from "./action-editor";
import { ConditionsEditor } from "./conditions-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AcaoTipo, RoutingRule, RuleCondicoes } from "@/lib/routing/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RoutingRule | null; // null = create, set = edit
  usuarios: { id: string; nome: string; perfil: string }[];
  onSaved: () => void;
};

export function RuleEditDialog({ open, onOpenChange, rule, usuarios, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* key força remount quando troca rule (cria→edita ou outra rule) — evita
            setState em useEffect pra sincronizar state inicial com props. */}
        {open && (
          <RuleEditForm
            key={rule?.id ?? "new"}
            rule={rule}
            usuarios={usuarios}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onSaved();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleEditForm({
  rule,
  usuarios,
  onCancel,
  onSaved,
}: {
  rule: RoutingRule | null;
  usuarios: { id: string; nome: string; perfil: string }[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(rule?.nome ?? "");
  const [ativa, setAtiva] = useState(rule?.ativa ?? true);
  const [condicoes, setCondicoes] = useState<RuleCondicoes>(
    (rule?.condicoes ?? {}) as RuleCondicoes,
  );
  const [acaoState, setAcaoState] = useState<AcaoState>(
    rule
      ? {
          acao: rule.acao as AcaoTipo,
          parametros: (rule.parametros ?? {}) as Record<string, unknown>,
        }
      : { acao: "pool_nao_atribuido", parametros: {} },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (nome.trim().length < 2) {
      setError("Nome muito curto");
      return;
    }
    if (acaoState.acao === "atribuir_usuario") {
      const id = acaoState.parametros.usuario_id as string | undefined;
      if (!id) {
        setError("Selecione um usuário para atribuir");
        return;
      }
    }
    if (acaoState.acao === "round_robin_grupo") {
      const grupo = acaoState.parametros.grupo_usuarios as string[] | undefined;
      if (!grupo || grupo.length === 0) {
        setError("Selecione pelo menos 1 usuário no grupo");
        return;
      }
    }

    const payload = {
      nome: nome.trim(),
      ativa,
      condicoes,
      acao: acaoState.acao,
      parametros:
        acaoState.acao === "pool_nao_atribuido" ? {} : acaoState.parametros,
    };

    setPending(true);
    const url = rule
      ? `/api/configuracoes/roteamento/${rule.id}`
      : `/api/configuracoes/roteamento`;
    const method = rule ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const msg =
        typeof json.error === "string" ? json.error : `Falha (status ${res.status})`;
      setError(msg);
      toast.error("Erro ao salvar regra", { description: msg });
      return;
    }
    toast.success(rule ? "Regra atualizada" : "Regra criada");
    onSaved();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{rule ? "Editar regra" : "Nova regra de roteamento"}</DialogTitle>
        <DialogDescription>
          Condições combinam com AND — todas precisam bater. Sem condições = bate sempre.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-2">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="rule-nome">Nome da regra</Label>
            <Input
              id="rule-nome"
              value={nome}
              onChange={(e) => setNome(e.currentTarget.value)}
              placeholder="Ex: Alta renda → Gabriel"
              disabled={pending}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativa} onCheckedChange={setAtiva} disabled={pending} />
            <Label className="cursor-pointer">{ativa ? "Ativa" : "Desativada"}</Label>
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Condições</h3>
          <ConditionsEditor
            value={condicoes}
            onChange={setCondicoes}
            disabled={pending}
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Ação quando bater</h3>
          <ActionEditor
            value={acaoState}
            onChange={setAcaoState}
            usuarios={usuarios}
            disabled={pending}
          />
        </section>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={onSubmit} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {rule ? "Salvar alterações" : "Criar regra"}
        </Button>
      </DialogFooter>
    </>
  );
}
