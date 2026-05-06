"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatusConfig } from "@/lib/status/queries";
import { cn } from "@/lib/utils";

type Props = { initial: StatusConfig[] };

export function StatusConfigList({ initial }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState<StatusConfig[]>(initial);
  const [editing, setEditing] = useState<StatusConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<StatusConfig | null>(null);
  const [deleting, setDeleting] = useState<StatusConfig | null>(null);
  // ID estável pro DndContext — sem isso o `aria-describedby` do dnd-kit
  // varia entre SSR (counter=0) e cliente (já tem outras DndContext mounted).
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    // Reatribui ordem incrementalmente (10, 20, 30...) pra ter espaço
    // entre vizinhos sem precisar reordenar tudo no futuro.
    const withOrdem = next.map((s, i) => ({ ...s, ordem: (i + 1) * 10 }));
    setItems(withOrdem);
    // Persiste no servidor
    void fetch("/api/configuracoes/status/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ordem: withOrdem.map((s) => ({ key: s.key, ordem: s.ordem })),
      }),
    })
      .then((res) => {
        if (!res.ok) {
          toast.error("Falha ao salvar ordem");
          setItems(initial);
        }
      })
      .catch(() => {
        toast.error("Erro de rede ao reordenar");
        setItems(initial);
      });
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Novo status
        </Button>
      </div>

      <div className="surface-solid rounded-xl overflow-hidden">
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {items.map((s) => (
              <Row
                key={s.id}
                status={s}
                onEdit={() => setEditing(s)}
                onToggleActive={() => {
                  if (s.ativo) {
                    setDeactivating(s);
                  } else {
                    void fetch(`/api/configuracoes/status/${s.id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ ativo: true }),
                    }).then((res) => {
                      if (res.ok) {
                        toast.success(`"${s.label}" reativado`);
                        refresh();
                      } else {
                        toast.error("Falha ao reativar");
                      }
                    });
                  }
                }}
                onDelete={() => setDeleting(s)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {creating && (
        <CreateDialog
          onOpenChange={(o) => {
            if (!o) setCreating(false);
          }}
          onSuccess={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}

      {editing && (
        <EditDialog
          status={editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          onSuccess={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deactivating && (
        <DeactivateDialog
          status={deactivating}
          others={items.filter((s) => s.ativo && s.key !== deactivating.key)}
          onOpenChange={(o) => {
            if (!o) setDeactivating(null);
          }}
          onSuccess={() => {
            setDeactivating(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          status={deleting}
          others={items.filter((s) => s.ativo && s.key !== deleting.key)}
          onOpenChange={(o) => {
            if (!o) setDeleting(null);
          }}
          onSuccess={() => {
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Row({
  status,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  status: StatusConfig;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 border-b border-foreground/5 last:border-b-0 bg-background",
        isDragging && "shadow-elev-md z-10 relative",
        !status.ativo && "opacity-50",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground"
        aria-label="Arrastar pra reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{status.label}</span>
          {status.eSistema && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-gold-700 dark:text-gold-400">
              sistema
            </span>
          )}
          {status.eTerminal && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              terminal
            </span>
          )}
          {!status.ativo && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-destructive">
              desativado
            </span>
          )}
        </div>
        <code className="font-mono text-[11px] text-muted-foreground">
          {status.key}
        </code>
      </div>

      <Button variant="ghost" size="sm" onClick={onEdit} title="Editar">
        <Pencil className="size-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleActive}
        title={status.ativo ? "Desativar" : "Reativar"}
      >
        {status.ativo ? (
          <EyeOff className="size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
      </Button>

      {/* Status sistema só pode ser desativado (botão olho acima) — o backend
          rejeita DELETE com 400. Esconder o botão evita o caminho frustrante
          de "clica excluir → confirma chave → recebe erro". Pra remover do
          funil, o admin usa Desativar; pra ocultar permanentemente, pode
          deixar desativado pra sempre. */}
      {!status.eSistema && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:bg-destructive/10"
          title="Excluir"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function CreateDialog({
  onOpenChange,
  onSuccess,
}: {
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [eTerminal, setETerminal] = useState(false);
  const [pending, setPending] = useState(false);
  const [autoKey, setAutoKey] = useState(true);

  function deriveKey(label: string): string {
    return label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50);
  }

  async function handleConfirm() {
    if (!label.trim() || !key.trim()) {
      toast.error("Nome e chave são obrigatórios");
      return;
    }
    setPending(true);
    const res = await fetch("/api/configuracoes/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: label.trim(), key, eTerminal }),
    });
    setPending(false);
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error("Falha ao criar status", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success(`Status "${label}" criado`);
    onSuccess();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="status-label">Nome de exibição</Label>
            <Input
              id="status-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (autoKey) setKey(deriveKey(e.target.value));
              }}
              placeholder="Ex: Aguardando avaliação"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status-key">Chave (snake_case)</Label>
            <Input
              id="status-key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setAutoKey(false);
              }}
              placeholder="ex: aguardando_avaliacao"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Identificador estável usado em queries. Não pode ser mudado depois.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={eTerminal}
              onChange={(e) => setETerminal(e.target.checked)}
              className="size-4"
            />
            <span>
              Status terminal (lead concluído — não recebe alertas de SLA nem
              entra em pipeline ativo)
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  status,
  onOpenChange,
  onSuccess,
}: {
  status: StatusConfig;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const [label, setLabel] = useState(status.label);
  const [eTerminal, setETerminal] = useState(status.eTerminal);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    if (!label.trim()) return;
    setPending(true);
    const res = await fetch(`/api/configuracoes/status/${status.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: label.trim(), eTerminal }),
    });
    setPending(false);
    if (!res.ok) {
      toast.error("Falha ao salvar");
      return;
    }
    toast.success("Status atualizado");
    onSuccess();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="status-edit-label">Nome de exibição</Label>
            <Input
              id="status-edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Chave</Label>
            <code className="block font-mono text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
              {status.key}
            </code>
            <p className="text-xs text-muted-foreground">
              Chave é imutável depois de criada (referenciada em queries e
              auditoria histórica).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={eTerminal}
              onChange={(e) => setETerminal(e.target.checked)}
              className="size-4"
              disabled={status.eSistema}
            />
            <span>
              Status terminal
              {status.eSistema && (
                <span className="text-muted-foreground ml-1">
                  (status sistema — flag fixa)
                </span>
              )}
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeactivateDialog({
  status,
  others,
  onOpenChange,
  onSuccess,
}: {
  status: StatusConfig;
  others: StatusConfig[];
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const [cascadeTo, setCascadeTo] = useState<string>("__auto__");
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    const res = await fetch(`/api/configuracoes/status/${status.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ativo: false,
        cascadeTo: cascadeTo === "__auto__" ? undefined : cascadeTo,
      }),
    });
    setPending(false);
    const json = (await res
      .json()
      .catch(() => ({}))) as { error?: string; cascade?: { target: string; movedCount: number } };
    if (!res.ok) {
      toast.error("Falha ao desativar", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    if (json.cascade && json.cascade.movedCount > 0) {
      toast.success(
        `Desativado. ${json.cascade.movedCount} lead${json.cascade.movedCount === 1 ? "" : "s"} movido${json.cascade.movedCount === 1 ? "" : "s"} para "${json.cascade.target}"`,
      );
    } else {
      toast.success("Status desativado");
    }
    onSuccess();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desativar &quot;{status.label}&quot;</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          <p>
            O status sumirá da UI mas continua existindo no banco — pode ser
            reativado depois. Leads que estão neste status serão movidos:
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="cascade-to">Mover leads para</Label>
            <Select value={cascadeTo} onValueChange={(v) => setCascadeTo(v ?? "__auto__")} disabled={pending}>
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) => {
                    if (v === "__auto__" || !v) return "Automático (status anterior)";
                    return others.find((o) => o.key === v)?.label ?? String(v);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">
                  Automático (status anterior na ordem)
                </SelectItem>
                {others.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Desativar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  status,
  others,
  onOpenChange,
  onSuccess,
}: {
  status: StatusConfig;
  others: StatusConfig[];
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const [cascadeTo, setCascadeTo] = useState<string>("__auto__");
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  // Status sistema (`fechado`, `desqualificado`, etc.) tem código que checa
  // a key direto pra modais especiais. Excluir exige digitar a key exata
  // pra reduzir chance de acidente.
  const requiresKeyConfirmation = status.eSistema;
  const matches = requiresKeyConfirmation
    ? confirmation.trim() === status.key
    : true;

  async function handleConfirm() {
    if (!matches) return;
    setPending(true);
    const url = new URL(
      `/api/configuracoes/status/${status.id}`,
      window.location.origin,
    );
    if (cascadeTo !== "__auto__") url.searchParams.set("cascadeTo", cascadeTo);
    const res = await fetch(url.toString(), { method: "DELETE" });
    setPending(false);
    const json = (await res
      .json()
      .catch(() => ({}))) as { error?: string; cascade?: { target: string; movedCount: number } };
    if (!res.ok) {
      toast.error("Falha ao excluir", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    if (json.cascade && json.cascade.movedCount > 0) {
      toast.success(
        `Excluído. ${json.cascade.movedCount} lead${json.cascade.movedCount === 1 ? "" : "s"} movido${json.cascade.movedCount === 1 ? "" : "s"} para "${json.cascade.target}"`,
      );
    } else {
      toast.success("Status excluído");
    }
    onSuccess();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir &quot;{status.label}&quot;</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          <p>
            <strong className="text-destructive">Não pode ser desfeito.</strong> Leads
            atualmente neste status serão movidos:
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="del-cascade-to">Mover leads para</Label>
            <Select value={cascadeTo} onValueChange={(v) => setCascadeTo(v ?? "__auto__")} disabled={pending}>
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) => {
                    if (v === "__auto__" || !v) return "Automático (status anterior)";
                    return others.find((o) => o.key === v)?.label ?? String(v);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">
                  Automático (status anterior na ordem)
                </SelectItem>
                {others.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {requiresKeyConfirmation && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-[13px] font-medium text-destructive">
                ⚠ Este é um status do sistema
              </p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Existe lógica no app que referencia a chave{" "}
                <code className="font-mono text-foreground">{status.key}</code>{" "}
                diretamente (modais especiais de fechamento, motivo, bancos
                etc.). Excluir <strong>quebra esses fluxos</strong> — você não
                conseguirá mais mover leads pra esse status nem disparar os
                modais associados.
              </p>
              <div className="space-y-1 pt-1">
                <Label htmlFor="confirm-key" className="text-[12px]">
                  Para confirmar, digite{" "}
                  <code className="font-mono font-semibold text-foreground">
                    {status.key}
                  </code>
                </Label>
                <input
                  id="confirm-key"
                  type="text"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={status.key}
                  disabled={pending}
                  autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive/40"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending || !matches}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Excluir permanentemente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
