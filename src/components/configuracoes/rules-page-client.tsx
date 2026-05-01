"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RuleEditDialog } from "./rule-edit-dialog";
import { RulesList } from "./rules-list";
import { RuleTester } from "./rule-tester";
import { Button } from "@/components/ui/button";
import type { RoutingRule } from "@/lib/routing/types";

type Props = {
  initialRules: RoutingRule[];
  usuarios: { id: string; nome: string; email: string; perfil: string }[];
};

export function RulesPageClient({ initialRules, usuarios }: Props) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [editing, setEditing] = useState<RoutingRule | null | "new">(null);
  const [, startTransition] = useTransition();

  async function reorderInBackend(newOrder: RoutingRule[]) {
    setRules(newOrder); // optimistic
    const res = await fetch("/api/configuracoes/roteamento/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: newOrder.map((r) => r.id) }),
    });
    if (!res.ok) {
      toast.error("Falha ao reordenar — recarregando");
      router.refresh();
      return;
    }
    startTransition(() => router.refresh());
  }

  async function deleteRule(rule: RoutingRule) {
    const prev = rules;
    setRules(rules.filter((r) => r.id !== rule.id)); // optimistic
    const res = await fetch(`/api/configuracoes/roteamento/${rule.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setRules(prev);
      toast.error("Falha ao excluir");
      return;
    }
    toast.success("Regra excluída");
    startTransition(() => router.refresh());
  }

  async function toggleAtiva(rule: RoutingRule, ativa: boolean) {
    const prev = rules;
    setRules(rules.map((r) => (r.id === rule.id ? { ...r, ativa } : r)));
    const res = await fetch(`/api/configuracoes/roteamento/${rule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: rule.nome,
        ativa,
        condicoes: rule.condicoes,
        acao: rule.acao,
        parametros: rule.parametros ?? {},
      }),
    });
    if (!res.ok) {
      setRules(prev);
      toast.error("Falha ao atualizar");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <RuleTester />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Regras ativas (ordem = prioridade)</h2>
          <p className="text-xs text-muted-foreground">
            Arraste pra reordenar. Top da lista = avaliada primeiro.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Nova regra
        </Button>
      </div>

      <RulesList
        rules={rules}
        usuarios={usuarios}
        onReorder={reorderInBackend}
        onEdit={(r) => setEditing(r)}
        onDelete={deleteRule}
        onToggleAtiva={toggleAtiva}
      />

      <RuleEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        rule={editing === "new" ? null : editing}
        usuarios={usuarios}
        onSaved={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
