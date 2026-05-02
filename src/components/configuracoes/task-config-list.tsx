"use client";

import { Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type StatusRow = {
  key: string;
  label: string;
  eTerminal: boolean;
  ordem: number;
};

type ConfigRow = {
  id: string;
  statusKey: string;
  ativo: boolean;
  titulo: string;
  descricao: string | null;
  frequenciaDias: number;
};

type Props = {
  statuses: StatusRow[];
  configs: ConfigRow[];
};

type RowVm = {
  status: StatusRow;
  config: ConfigRow | null;
};

function freqLabel(dias: number): string {
  if (dias === 1) return "Diária";
  if (dias === 7) return "Semanal";
  if (dias === 14) return "Quinzenal";
  if (dias === 30) return "Mensal";
  return `A cada ${dias} dias`;
}

export function TaskConfigList({ statuses, configs }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<RowVm | null>(null);

  // Cruza statuses + configs num único array.
  const rows: RowVm[] = statuses.map((s) => ({
    status: s,
    config: configs.find((c) => c.statusKey === s.key) ?? null,
  }));

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="surface-solid rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum status ativo configurado.{" "}
            <a
              href="/configuracoes/status"
              className="text-primary hover:underline"
            >
              Configurar status do funil
            </a>
          </div>
        ) : (
          rows.map((r) => (
            <Row
              key={r.status.key}
              vm={r}
              onEdit={() => setEditing(r)}
              onToggle={async () => {
                if (!r.config) {
                  toast.error("Configure a tarefa primeiro");
                  return;
                }
                const res = await fetch(
                  `/api/configuracoes/tarefas-config/${r.config.id}`,
                  {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ativo: !r.config.ativo }),
                  },
                );
                if (!res.ok) {
                  toast.error("Falha ao alternar");
                  return;
                }
                toast.success(
                  r.config.ativo
                    ? `Tarefas para "${r.status.label}" desativadas`
                    : `Tarefas para "${r.status.label}" ativadas`,
                );
                refresh();
              }}
            />
          ))
        )}
      </div>

      {editing && (
        <EditDialog
          vm={editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          onSuccess={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Row({ vm, onEdit, onToggle }: { vm: RowVm; onEdit: () => void; onToggle: () => void }) {
  const isTerminal = vm.status.eTerminal;
  const config = vm.config;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 border-b border-foreground/5 last:border-b-0",
        isTerminal && "opacity-50",
        config && !config.ativo && "opacity-60",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{vm.status.label}</span>
          {isTerminal && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              terminal
            </span>
          )}
          {config && !config.ativo && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-destructive">
              desativado
            </span>
          )}
        </div>
        {config ? (
          <>
            <p className="text-sm text-foreground mt-0.5 truncate">
              {config.titulo}
            </p>
            {config.descricao && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {config.descricao}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
              {freqLabel(config.frequenciaDias)}
            </p>
          </>
        ) : (
          <p className="text-xs italic text-muted-foreground mt-0.5">
            {isTerminal
              ? "Status terminal — tarefas não se aplicam"
              : "Sem configuração — não gera tarefas. Clique em Editar."}
          </p>
        )}
      </div>

      {!isTerminal && (
        <>
          {config && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              title={config.ativo ? "Desativar" : "Ativar"}
            >
              <span className="text-xs">{config.ativo ? "Desativar" : "Ativar"}</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        </>
      )}
    </div>
  );
}

function EditDialog({
  vm,
  onOpenChange,
  onSuccess,
}: {
  vm: RowVm;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const [titulo, setTitulo] = useState(
    vm.config?.titulo ?? "Fazer acompanhamento do lead",
  );
  const [descricao, setDescricao] = useState(vm.config?.descricao ?? "");
  const [frequenciaDias, setFrequenciaDias] = useState<number>(
    vm.config?.frequenciaDias ?? 1,
  );
  const [ativo, setAtivo] = useState<boolean>(vm.config?.ativo ?? true);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    if (!titulo.trim()) {
      toast.error("Título obrigatório");
      return;
    }
    if (frequenciaDias < 1 || frequenciaDias > 30) {
      toast.error("Frequência entre 1 e 30 dias");
      return;
    }
    setPending(true);
    const res = await fetch("/api/configuracoes/tarefas-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        statusKey: vm.status.key,
        ativo,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        frequenciaDias,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Falha ao salvar", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success(`Tarefas de "${vm.status.label}" atualizadas`);
    onSuccess();
  }

  const PRESETS = [
    { value: 1, label: "Diária" },
    { value: 2, label: "A cada 2 dias" },
    { value: 5, label: "A cada 5 dias" },
    { value: 7, label: "Semanal" },
    { value: 14, label: "Quinzenal" },
    { value: 30, label: "Mensal" },
  ];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Tarefa para &quot;{vm.status.label}&quot;
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-titulo">Título da tarefa</Label>
            <Input
              id="task-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Entrar em contato com o lead"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-descricao">Descrição (opcional)</Label>
            <Textarea
              id="task-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Contexto e instruções para o consultor"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-freq">Frequência (dias)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setFrequenciaDias(p.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition-colors",
                    frequenciaDias === p.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Input
              id="task-freq"
              type="number"
              min={1}
              max={30}
              value={frequenciaDias}
              onChange={(e) => setFrequenciaDias(Number(e.target.value) || 1)}
              className="w-32 mt-1"
            />
            <p className="text-xs text-muted-foreground">
              1 = nova tarefa todo dia útil. 7 = uma vez por semana. Máximo 30.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="size-4"
            />
            <span>Gerar tarefas para leads neste status</span>
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
