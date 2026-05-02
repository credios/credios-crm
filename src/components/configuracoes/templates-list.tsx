"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { EmptyTemplates } from "@/components/shared/illustrations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { STATUS_LEAD_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

import type { TemplateRow } from "./template-edit-dialog";

type Props = {
  templates: TemplateRow[];
  onReorder: (next: TemplateRow[]) => void;
  onEdit: (t: TemplateRow) => void;
  onDelete: (t: TemplateRow) => void;
  onToggleAtiva: (t: TemplateRow, ativa: boolean) => void;
};

export function TemplatesList({
  templates,
  onReorder,
  onEdit,
  onDelete,
  onToggleAtiva,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = templates.findIndex((t) => t.id === active.id);
    const newIdx = templates.findIndex((t) => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(templates, oldIdx, newIdx));
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed">
        <EmptyState
          illustration={<EmptyTemplates />}
          title="Nenhum template criado"
          description="Crie templates de mensagem para acelerar o follow-up dos consultores no WhatsApp."
        />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={templates.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {templates.map((t) => (
            <Row
              key={t.id}
              template={t}
              onEdit={() => onEdit(t)}
              onDelete={() => onDelete(t)}
              onToggleAtiva={(v) => onToggleAtiva(t, v)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Row({
  template,
  onEdit,
  onDelete,
  onToggleAtiva,
}: {
  template: TemplateRow;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAtiva: (ativa: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: template.id });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border bg-card p-3 flex items-start gap-3",
        !template.ativa && "opacity-60",
      )}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground self-stretch flex items-center"
        aria-label="Reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium">{template.nome}</h3>
          {!template.ativa && (
            <Badge variant="outline" className="text-xs">desativado</Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            #{template.ordem}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{template.conteudo}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {(template.statusAplicavel ?? []).map((s) => (
            <Badge key={s} variant="outline" className="text-[10px]">
              {STATUS_LEAD_LABEL[s] ?? s}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Switch
          checked={template.ativa}
          onCheckedChange={(v) => onToggleAtiva(v === true)}
          aria-label="Ativar/desativar"
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Editar">
          <Pencil className="size-3.5" />
        </Button>
        {confirmingDelete ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="xs"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
            >
              Confirmar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Excluir"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}
