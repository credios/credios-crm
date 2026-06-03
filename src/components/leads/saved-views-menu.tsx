"use client";

import {
  Bookmark,
  BookmarkPlus,
  Check,
  KanbanSquare,
  List,
  Loader2,
  Settings2,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateBr } from "@/lib/formatters/date";
import {
  type SavedLeadView,
  sanitizeFiltros,
  type ViewMode,
} from "@/lib/validators/lead-view";

type Props = {
  current: ViewMode;
  views: SavedLeadView[];
};

function basePath(mode: ViewMode): string {
  return mode === "kanban" ? "/leads/kanban" : "/leads";
}

function filtrosIguais(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export function SavedViewsMenu({ current, views }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filtros atuais (da URL), só as chaves persistíveis.
  const filtrosAtuais = useMemo(() => {
    const obj: Record<string, string> = {};
    params.forEach((v, k) => {
      obj[k] = v;
    });
    return sanitizeFiltros(obj);
  }, [params]);

  // Visualização ativa = mesma tela + mesmos filtros.
  const ativa = useMemo(
    () =>
      views.find(
        (v) =>
          v.viewMode === current && filtrosIguais(v.filtros, filtrosAtuais),
      ) ?? null,
    [views, current, filtrosAtuais],
  );

  const temFiltros = Object.keys(filtrosAtuais).length > 0;

  function aplicar(view: SavedLeadView) {
    const qs = new URLSearchParams(view.filtros).toString();
    const base = basePath(view.viewMode);
    startTransition(() => router.push(qs ? `${base}?${qs}` : base));
  }

  async function salvar() {
    const limpo = nome.trim();
    if (!limpo) {
      toast.error("Dê um nome à visualização");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/lead-views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: limpo,
        viewMode: current,
        filtros: filtrosAtuais,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não foi possível salvar", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success(`Visualização "${limpo}" salva`);
    setNome("");
    setSaveOpen(false);
    startTransition(() => router.refresh());
  }

  async function excluir(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/lead-views/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      toast.error("Não foi possível excluir");
      return;
    }
    toast.success("Visualização excluída");
    startTransition(() => router.refresh());
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="font-medium">
              <Bookmark className="size-3.5" />
              <span className="max-w-[160px] truncate">
                {ativa ? ativa.nome : "Visualizações"}
              </span>
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-[260px]">
          <DropdownMenuLabel>Visualizações salvas</DropdownMenuLabel>
          {views.length === 0 ? (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">
              Nenhuma salva ainda. Ajuste os filtros e salve a visualização
              atual.
            </p>
          ) : (
            <div className="max-h-[280px] overflow-y-auto">
              {views.map((view) => {
                const ModeIcon =
                  view.viewMode === "kanban" ? KanbanSquare : List;
                const isAtiva = ativa?.id === view.id;
                return (
                  <DropdownMenuItem
                    key={view.id}
                    onClick={() => aplicar(view)}
                    className="gap-2"
                  >
                    <ModeIcon className="size-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{view.nome}</span>
                    {isAtiva && (
                      <Check className="size-3.5 text-primary" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>
            <BookmarkPlus className="size-3.5" />
            Salvar visualização atual
          </DropdownMenuItem>
          {views.length > 0 && (
            <DropdownMenuItem onClick={() => setManageOpen(true)}>
              <Settings2 className="size-3.5" />
              Gerenciar visualizações
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog: salvar visualização atual */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar visualização</DialogTitle>
            <DialogDescription>
              Guarda os filtros e a ordenação atuais como{" "}
              {current === "kanban" ? "um kanban" : "uma lista"} nomeada, para
              reabrir com um clique.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="saved-view-nome">Nome</Label>
              <Input
                id="saved-view-nome"
                value={nome}
                maxLength={60}
                autoFocus
                placeholder="Ex.: Alto valor em SP, Esfriando, Meus de hoje…"
                onChange={(e) => setNome(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) {
                    e.preventDefault();
                    void salvar();
                  }
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {temFiltros
                ? `${Object.keys(filtrosAtuais).length} filtro(s)/ordenação capturados.`
                : "Sem filtros ativos — salvará a visualização padrão."}
            </p>
          </div>

          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={saving} />}
            >
              Cancelar
            </DialogClose>
            <Button onClick={() => void salvar()} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: gerenciar/excluir visualizações */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar visualizações</DialogTitle>
            <DialogDescription>
              Selecione no menu para aplicar. Aqui você pode excluir as que não
              usa mais.
            </DialogDescription>
          </DialogHeader>

          {views.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground italic">
              Nenhuma visualização salva.
            </p>
          ) : (
            <ul className="divide-y divide-foreground/8 max-h-[320px] overflow-y-auto">
              {views.map((view) => {
                const ModeIcon =
                  view.viewMode === "kanban" ? KanbanSquare : List;
                return (
                  <li
                    key={view.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <ModeIcon className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {view.nome}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {view.viewMode === "kanban" ? "Kanban" : "Lista"} ·
                        criada {formatDateBr(view.createdAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={`Excluir "${view.nome}"`}
                      aria-label={`Excluir ${view.nome}`}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      disabled={deletingId === view.id}
                      onClick={() => void excluir(view.id)}
                    >
                      {deletingId === view.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Fechar
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
