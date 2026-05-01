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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AcaoTipo, RoutingRule, RuleCondicoes } from "@/lib/routing/types";
import { cn } from "@/lib/utils";

type Props = {
  rules: RoutingRule[];
  usuarios: { id: string; nome: string }[];
  onReorder: (newOrder: RoutingRule[]) => void;
  onEdit: (rule: RoutingRule) => void;
  onDelete: (rule: RoutingRule) => void;
  onToggleAtiva: (rule: RoutingRule, ativa: boolean) => void;
};

export function RulesList({
  rules,
  usuarios,
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
    const oldIdx = rules.findIndex((r) => r.id === active.id);
    const newIdx = rules.findIndex((r) => r.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(rules, oldIdx, newIdx));
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhuma regra configurada. Sem regras, todo lead vai para o pool não-atribuído.
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              usuarios={usuarios}
              onEdit={() => onEdit(r)}
              onDelete={() => onDelete(r)}
              onToggleAtiva={(ativa) => onToggleAtiva(r, ativa)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function RuleRow({
  rule,
  usuarios,
  onEdit,
  onDelete,
  onToggleAtiva,
}: {
  rule: RoutingRule;
  usuarios: { id: string; nome: string }[];
  onEdit: () => void;
  onDelete: () => void;
  onToggleAtiva: (ativa: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rule.id });
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
        !rule.ativa && "opacity-60",
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
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{rule.nome}</h3>
          {!rule.ativa && (
            <Badge variant="outline" className="text-xs">
              desativada
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            prio {rule.prioridade}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Quando:</span> {summarizeConditions(rule.condicoes)}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Faz:</span>{" "}
          {summarizeAction(rule.acao as AcaoTipo, rule.parametros, usuarios)}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Switch
          checked={rule.ativa}
          onCheckedChange={(v) => onToggleAtiva(v === true)}
          aria-label="Ativar/desativar"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="Editar"
        >
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

function summarizeConditions(c: RuleCondicoes): string {
  const bits: string[] = [];
  if (c.valor_credito_min != null) bits.push(`crédito ≥ R$ ${(c.valor_credito_min / 100).toLocaleString("pt-BR")}`);
  if (c.valor_credito_max != null) bits.push(`crédito ≤ R$ ${(c.valor_credito_max / 100).toLocaleString("pt-BR")}`);
  if (c.valor_imovel_min != null) bits.push(`imóvel ≥ R$ ${(c.valor_imovel_min / 100).toLocaleString("pt-BR")}`);
  if (c.valor_imovel_max != null) bits.push(`imóvel ≤ R$ ${(c.valor_imovel_max / 100).toLocaleString("pt-BR")}`);
  if (c.estado_in?.length) bits.push(`UF ∈ {${c.estado_in.join(",")}}`);
  if (c.origem_in?.length) bits.push(`origem ∈ {${c.origem_in.join(",")}}`);
  if (c.tipo_imovel_in?.length) bits.push(`imóvel ∈ {${c.tipo_imovel_in.join(",")}}`);
  if (c.horario_comercial != null)
    bits.push(c.horario_comercial ? "horário comercial" : "fora do horário");
  return bits.length === 0 ? "qualquer lead (sem condições)" : bits.join(" + ");
}

function summarizeAction(
  acao: AcaoTipo,
  parametros: Record<string, unknown> | null,
  usuarios: { id: string; nome: string }[],
): string {
  const userMap = new Map(usuarios.map((u) => [u.id, u.nome]));
  switch (acao) {
    case "atribuir_usuario": {
      const uid = (parametros?.usuario_id as string) || null;
      return uid ? `→ atribui a ${userMap.get(uid) ?? uid.slice(0, 8)}` : "→ atribuir (sem usuário)";
    }
    case "round_robin_grupo": {
      const grupo = (parametros?.grupo_usuarios as string[] | undefined) ?? [];
      if (grupo.length === 0) return "→ round-robin (grupo vazio)";
      const nomes = grupo.map((id) => userMap.get(id) ?? id.slice(0, 8));
      return `→ round-robin entre ${nomes.join(", ")}`;
    }
    case "pool_nao_atribuido":
      return "→ deixar no pool";
  }
}
