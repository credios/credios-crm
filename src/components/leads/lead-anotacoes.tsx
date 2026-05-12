"use client";

import { Loader2, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { formatLong, formatRelative } from "@/lib/formatters/date";
import { useAnotacoesRealtime } from "@/lib/realtime/use-anotacoes-realtime";
import { cn } from "@/lib/utils";

// ============================================================================
// Aba "Anotações" do lead — texto livre editável (tabela lead_anotacoes)
// ============================================================================
// Permissões (server enforce também):
//   - Criar/editar: admin OU consultor atribuído ao lead
//   - Excluir: somente admin
// Cada edição/exclusão passa por modal de confirmação na UI.
// ============================================================================

export type Anotacao = {
  id: string;
  titulo: string | null;
  conteudo: string;
  autorId: string | null;
  autorNome: string | null;
  editadoEm: string | null;
  editadoPor: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  leadId: string;
  initial: Anotacao[];
  /** Quem pode criar/editar (admin OU consultor atribuído ao lead). */
  canEdit: boolean;
  /** Quem pode excluir (admin only). */
  canDelete: boolean;
};

const MAX_CONTEUDO = 10_000;

function initials(nome: string | null): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function LeadAnotacoes({ leadId, initial, canEdit, canDelete }: Props) {
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoConteudo, setNovoConteudo] = useState("");
  const [pendingCreate, setPendingCreate] = useState(false);

  const [editing, setEditing] = useState<Anotacao | null>(null);
  const [editingTitulo, setEditingTitulo] = useState("");
  const [editingConteudo, setEditingConteudo] = useState("");
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(false);

  const [deleting, setDeleting] = useState<Anotacao | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  // Realtime — outra aba do mesmo consultor (ou admin) gera evento.
  const onRealtimeChange = useCallback(
    (event: "INSERT" | "UPDATE" | "DELETE", row: Record<string, unknown>) => {
      if (event === "DELETE") {
        const id = String(row.id);
        setAnotacoes((prev) => prev.filter((a) => a.id !== id));
        return;
      }
      const next: Anotacao = {
        id: String(row.id),
        titulo: (row.titulo as string | null) ?? null,
        conteudo: String(row.conteudo ?? ""),
        autorId: (row.autor_id as string | null) ?? null,
        autorNome: null, // realtime não traz JOIN
        editadoEm: (row.editado_em as string | null) ?? null,
        editadoPor: (row.editado_por as string | null) ?? null,
        createdAt: String(row.created_at ?? new Date().toISOString()),
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      };
      if (event === "INSERT") {
        setAnotacoes((prev) =>
          prev.some((a) => a.id === next.id) ? prev : [next, ...prev],
        );
      } else {
        setAnotacoes((prev) =>
          prev.map((a) => {
            if (a.id !== next.id) return a;
            // Preserva autorNome do JOIN inicial caso ainda exista localmente
            return { ...next, autorNome: a.autorNome };
          }),
        );
      }
    },
    [],
  );
  useAnotacoesRealtime(leadId, onRealtimeChange);

  // Ordenação reversa cronológica
  const ordered = useMemo(
    () =>
      [...anotacoes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [anotacoes],
  );

  async function handleCreate() {
    if (!novoConteudo.trim()) {
      toast.error("Conteúdo é obrigatório");
      return;
    }
    if (novoConteudo.length > MAX_CONTEUDO) {
      toast.error(`Máximo ${MAX_CONTEUDO.toLocaleString("pt-BR")} caracteres`);
      return;
    }
    setPendingCreate(true);
    const res = await fetch(`/api/leads/${leadId}/anotacoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        titulo: novoTitulo.trim() || null,
        conteudo: novoConteudo.trim(),
      }),
    });
    setPendingCreate(false);
    if (!res.ok) {
      toast.error("Erro ao criar anotação");
      return;
    }
    toast.success("Anotação criada");
    setNovoTitulo("");
    setNovoConteudo("");
    setShowCreate(false);
    // Realtime atualiza a lista
  }

  function startEdit(a: Anotacao) {
    setEditing(a);
    setEditingTitulo(a.titulo ?? "");
    setEditingConteudo(a.conteudo);
    setConfirmEdit(false);
  }

  function cancelEdit() {
    setEditing(null);
    setEditingTitulo("");
    setEditingConteudo("");
    setConfirmEdit(false);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editingConteudo.trim()) {
      toast.error("Conteúdo não pode ser vazio");
      return;
    }
    if (editingConteudo.length > MAX_CONTEUDO) {
      toast.error(`Máximo ${MAX_CONTEUDO.toLocaleString("pt-BR")} caracteres`);
      return;
    }
    setPendingEdit(true);
    const res = await fetch(
      `/api/leads/${leadId}/anotacoes/${editing.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titulo: editingTitulo.trim() || null,
          conteudo: editingConteudo.trim(),
        }),
      },
    );
    setPendingEdit(false);
    if (!res.ok) {
      toast.error("Erro ao salvar edição");
      return;
    }
    toast.success("Anotação editada");
    cancelEdit();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setPendingDelete(true);
    const res = await fetch(
      `/api/leads/${leadId}/anotacoes/${deleting.id}`,
      { method: "DELETE" },
    );
    setPendingDelete(false);
    if (!res.ok) {
      toast.error("Erro ao excluir anotação");
      return;
    }
    toast.success("Anotação excluída");
    setDeleting(null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-base">Anotações</CardTitle>
        </div>
        {canEdit && !showCreate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreate(true)}
            className="shrink-0"
          >
            <Plus className="size-3.5" /> Nova anotação
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form criar */}
        {showCreate && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1">
              <Label htmlFor="anot-titulo" className="text-xs">
                Título <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="anot-titulo"
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.currentTarget.value)}
                placeholder="Ex.: Dados do cônjuge, Contexto da ligação…"
                maxLength={100}
                disabled={pendingCreate}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="anot-conteudo" className="text-xs">
                Conteúdo
              </Label>
              <Textarea
                id="anot-conteudo"
                value={novoConteudo}
                onChange={(e) => setNovoConteudo(e.currentTarget.value)}
                placeholder="Anote infos úteis do cliente, da ligação, do cônjuge…"
                rows={5}
                maxLength={MAX_CONTEUDO}
                disabled={pendingCreate}
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {novoConteudo.length.toLocaleString("pt-BR")} / {MAX_CONTEUDO.toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreate(false);
                  setNovoTitulo("");
                  setNovoConteudo("");
                }}
                disabled={pendingCreate}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={pendingCreate}>
                {pendingCreate && <Loader2 className="size-3.5 animate-spin" />}
                Salvar anotação
              </Button>
            </div>
          </div>
        )}

        {/* Lista */}
        {ordered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 px-4 py-8 text-center space-y-1.5">
            <div className="flex justify-center">
              <StickyNote className="size-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="font-display text-sm font-semibold">
              Sem anotações ainda
            </p>
            <p className="font-serif italic text-xs text-muted-foreground leading-relaxed">
              Use anotações pra registrar infos úteis que não cabem em campos
              estruturados — dados do cônjuge, contexto da ligação,
              pendências do cartório etc.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {ordered.map((a) => (
              <AnotacaoCard
                key={a.id}
                anotacao={a}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={() => startEdit(a)}
                onDelete={() => setDeleting(a)}
              />
            ))}
          </ul>
        )}
      </CardContent>

      {/* Dialog: editar anotação */}
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && !pendingEdit && cancelEdit()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar anotação</DialogTitle>
            <DialogDescription>
              A versão anterior será substituída ao salvar. A edição fica
              registrada no audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-titulo" className="text-xs">
                Título <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="edit-titulo"
                value={editingTitulo}
                onChange={(e) => setEditingTitulo(e.currentTarget.value)}
                maxLength={100}
                disabled={pendingEdit}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-conteudo" className="text-xs">
                Conteúdo
              </Label>
              <Textarea
                id="edit-conteudo"
                value={editingConteudo}
                onChange={(e) => setEditingConteudo(e.currentTarget.value)}
                rows={8}
                maxLength={MAX_CONTEUDO}
                disabled={pendingEdit}
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {editingConteudo.length.toLocaleString("pt-BR")} / {MAX_CONTEUDO.toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelEdit} disabled={pendingEdit}>
              Cancelar
            </Button>
            {!confirmEdit ? (
              <Button onClick={() => setConfirmEdit(true)} disabled={pendingEdit}>
                Salvar
              </Button>
            ) : (
              <Button
                variant="accent"
                onClick={saveEdit}
                disabled={pendingEdit}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {pendingEdit && <Loader2 className="size-3.5 animate-spin" />}
                Confirmar e salvar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar exclusão */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(o) => !o && !pendingDelete && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir anotação?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. A exclusão fica registrada no
              audit log.
            </DialogDescription>
          </DialogHeader>
          {deleting && (
            <div className="space-y-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
              {deleting.titulo && (
                <p className="font-medium">{deleting.titulo}</p>
              )}
              <p className="whitespace-pre-wrap text-muted-foreground line-clamp-4">
                {deleting.conteudo}
              </p>
              <p className="text-xs text-muted-foreground">
                Criada por {deleting.autorNome ?? "—"} ·{" "}
                {formatRelative(deleting.createdAt)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={pendingDelete}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pendingDelete}
            >
              {pendingDelete && <Loader2 className="size-3.5 animate-spin" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AnotacaoCard({
  anotacao,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  anotacao: Anotacao;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border border-foreground/8 bg-card p-3 space-y-2",
        "transition-shadow hover:shadow-elev-sm",
      )}
    >
      {anotacao.titulo && (
        <p className="font-display text-sm font-semibold">{anotacao.titulo}</p>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {anotacao.conteudo}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {anotacao.autorNome && (
            <span className="flex items-center gap-1">
              <Avatar className="size-4 ring-1 ring-foreground/10">
                <AvatarFallback className="text-[9px] font-medium">
                  {initials(anotacao.autorNome)}
                </AvatarFallback>
              </Avatar>
              {anotacao.autorNome}
            </span>
          )}
          <span title={formatLong(anotacao.createdAt)}>
            {formatRelative(anotacao.createdAt)}
          </span>
          {anotacao.editadoEm && (
            <span
              className="font-mono text-[10px] uppercase tracking-wider text-gold-700 dark:text-gold-400"
              title={`editado em ${formatLong(anotacao.editadoEm)}`}
            >
              editado
            </span>
          )}
        </div>
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                title="Editar"
                className="h-7 px-2"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                title="Excluir (admin)"
                className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

