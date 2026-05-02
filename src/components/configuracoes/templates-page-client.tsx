"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  TemplateEditDialog,
  type TemplateRow,
} from "./template-edit-dialog";
import { TemplatesList } from "./templates-list";
import { Button } from "@/components/ui/button";

type Props = {
  initial: TemplateRow[];
};

export function TemplatesPageClient({ initial }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initial);
  const [editing, setEditing] = useState<TemplateRow | null | "new">(null);
  const [, startTransition] = useTransition();

  async function reorder(next: TemplateRow[]) {
    setTemplates(next.map((t, i) => ({ ...t, ordem: i + 1 })));
    const res = await fetch("/api/configuracoes/mensagens/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: next.map((t) => t.id) }),
    });
    if (!res.ok) {
      toast.error("Falha ao reordenar — recarregando");
    }
    startTransition(() => router.refresh());
  }

  async function deleteTemplate(t: TemplateRow) {
    const prev = templates;
    setTemplates(templates.filter((x) => x.id !== t.id));
    const res = await fetch(`/api/configuracoes/mensagens/${t.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setTemplates(prev);
      toast.error("Falha ao excluir");
      return;
    }
    toast.success("Template excluído");
    startTransition(() => router.refresh());
  }

  async function toggleAtiva(t: TemplateRow, ativa: boolean) {
    const prev = templates;
    setTemplates(templates.map((x) => (x.id === t.id ? { ...x, ativa } : x)));
    const res = await fetch(`/api/configuracoes/mensagens/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: t.nome,
        conteudo: t.conteudo,
        statusAplicavel: t.statusAplicavel ?? [],
        ativa,
      }),
    });
    if (!res.ok) {
      setTemplates(prev);
      toast.error("Falha ao atualizar");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Templates ativos (ordem mostrada no detalhe do lead)</h2>
          <p className="text-xs text-muted-foreground">
            Arraste pra reordenar. Templates filtram por status do lead.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Novo template
        </Button>
      </div>

      <TemplatesList
        templates={templates}
        onReorder={reorder}
        onEdit={(t) => setEditing(t)}
        onDelete={deleteTemplate}
        onToggleAtiva={toggleAtiva}
      />

      <TemplateEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        template={editing === "new" ? null : editing}
        onSaved={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
