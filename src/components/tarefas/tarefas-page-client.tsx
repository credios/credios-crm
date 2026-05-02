"use client";

import {
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ACAO_TAREFA_LABEL,
  STATUS_LEAD_LABEL,
  STATUS_TAREFA_LABEL,
} from "@/lib/constants";
import { formatBrlShort } from "@/lib/formatters/currency";
import { formatDateTimeBr, formatRelative } from "@/lib/formatters/date";
import type { TaskRowForList } from "@/lib/tasks/types";
import type { AcaoTarefa } from "@/lib/validators/task";
import { cn } from "@/lib/utils";

type Props = {
  tasks: TaskRowForList[];
  consultores: { id: string; nome: string }[];
  stats: {
    consultorId: string;
    consultorNome: string;
    total: number;
    abertas: number;
    atrasadas: number;
    concluidas: number;
  }[];
  semTarefa: number;
  canManage: boolean;
  /** Tarefas concluídas hoje (BRT). Vazio quando !canManage. */
  completedToday?: TaskRowForList[];
  /** YYYY-MM-DD do "hoje BRT" usado pra filtrar completedToday. */
  todayYmd?: string;
};

const ACTIONS = Object.entries(ACAO_TAREFA_LABEL) as [AcaoTarefa, string][];

const STATUS_FILTER_LABEL: Record<string, string> = {
  aberta: "Abertas",
  atrasada: "Atrasadas",
  concluida: "Concluídas",
  todas: "Todas",
};

export function TarefasPageClient({
  tasks,
  consultores,
  stats,
  semTarefa,
  canManage,
  completedToday = [],
  todayYmd,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [completing, setCompleting] = useState<TaskRowForList | null>(null);

  const abertas = tasks.filter((t) => t.status === "aberta").length;
  const atrasadas = tasks.filter((t) => t.status === "atrasada").length;
  const concluidas = tasks.filter((t) => t.status === "concluida").length;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "__all__") next.delete(key);
    else next.set(key, value);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
            Tarefas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow-ups diários para manter leads ativos em movimento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={atrasadas > 0 ? "destructive" : "soft"}>
            {atrasadas} atrasadas
          </Badge>
          <Badge variant="outline">{abertas} abertas</Badge>
          <Badge variant="outline">{concluidas} concluídas</Badge>
        </div>
      </div>

      <div className="surface-solid rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select
            value={params.get("status") ?? "aberta"}
            onValueChange={(v) => setParam("status", v === "aberta" ? null : v)}
          >
            <SelectTrigger className="w-40">
              <SelectValue>
                {(v: unknown) => {
                  const s = typeof v === "string" ? v : "aberta";
                  return STATUS_FILTER_LABEL[s] ?? "Abertas";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aberta">Abertas</SelectItem>
              <SelectItem value="atrasada">Atrasadas</SelectItem>
              <SelectItem value="concluida">Concluídas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          {canManage && (
            <Select
              value={params.get("consultorId") ?? "__all__"}
              onValueChange={(v) => setParam("consultorId", v)}
            >
              <SelectTrigger className="w-56">
                <SelectValue>
                  {(v: unknown) => {
                    if (typeof v !== "string" || v === "__all__") {
                      return "Todos consultores";
                    }
                    return (
                      consultores.find((c) => c.id === v)?.nome ??
                      "Todos consultores"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos consultores</SelectItem>
                {consultores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {canManage && (
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Leads ativos sem tarefa" value={semTarefa} tone={semTarefa > 0 ? "danger" : "ok"} />
          <Metric
            label="Consultores com atraso"
            value={stats.filter((s) => s.atrasadas > 0).length}
            tone={stats.some((s) => s.atrasadas > 0) ? "danger" : "ok"}
          />
          <Metric
            label="Conclusões hoje"
            value={stats.reduce((sum, s) => sum + s.concluidas, 0)}
          />
        </div>
      )}

      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-foreground/15 p-10 text-center space-y-2">
            <CheckCircle2 className="mx-auto size-9 text-emerald-600" strokeWidth={1.5} />
            <p className="font-display text-base font-semibold">Tudo em dia ✓</p>
            <p className="font-serif italic text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              Nenhuma tarefa pendente nesse filtro. As próximas tarefas
              aparecem todo dia útil de manhã, ou conforme as configurações
              de frequência por status.
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <article
              key={task.id}
              className={cn(
                "surface-solid rounded-xl p-4 transition-colors",
                task.status === "atrasada" && "border-destructive/35",
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={task.status} />
                    <Badge variant="outline">
                      {STATUS_LEAD_LABEL[task.leadStatus] ?? task.leadStatus}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      vence {formatRelative(task.venceEm)}
                    </span>
                  </div>
                  <div>
                    <Link
                      href={`/leads/${task.leadId}`}
                      prefetch={false}
                      className="font-display text-lg font-semibold hover:underline"
                    >
                      {task.leadNome}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {task.titulo}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{task.consultorNome}</span>
                    <span>{formatBrlShort(task.valorCreditoCentavos)}</span>
                    {task.origem && <span>{task.origem}</span>}
                    <span title={formatDateTimeBr(task.createdAt)}>
                      criada {formatRelative(task.createdAt)}
                    </span>
                  </div>
                  {task.status === "concluida" && (
                    <p className="text-sm text-muted-foreground">
                      {task.acaoConclusao
                        ? ACAO_TAREFA_LABEL[task.acaoConclusao]
                        : "Concluída"}
                      {task.observacaoConclusao
                        ? ` · ${task.observacaoConclusao}`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link href={`/leads/${task.leadId}`} prefetch={false}>
                        <ExternalLink className="size-4" /> Lead
                      </Link>
                    }
                  />
                  {task.status !== "concluida" && (
                    <Button size="sm" onClick={() => setCompleting(task)}>
                      <CheckCircle2 className="size-4" /> Concluir
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {canManage && (
        <ConcluidasHojePorConsultor
          tasks={completedToday}
          todayYmd={todayYmd}
        />
      )}

      {canManage && stats.length > 0 && (
        <div className="surface-solid rounded-xl p-4">
          <h2 className="font-display text-lg font-semibold">Resumo por consultor</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Consultor</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Abertas</th>
                  <th className="py-2 text-right">Atrasadas</th>
                  <th className="py-2 text-right">Concluídas</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.consultorId} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.consultorNome}</td>
                    <td className="py-2 text-right">{s.total}</td>
                    <td className="py-2 text-right">{s.abertas}</td>
                    <td className="py-2 text-right text-destructive">{s.atrasadas}</td>
                    <td className="py-2 text-right">{s.concluidas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {completing && (
        <CompleteTaskDialog
          task={completing}
          onOpenChange={(open) => !open && setCompleting(null)}
          onDone={() => {
            setCompleting(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "ok";
}) {
  return (
    <div className="surface-solid rounded-xl p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-3xl font-semibold",
          tone === "danger" && "text-destructive",
          tone === "ok" && "text-emerald-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "atrasada" ? "destructive" : status === "concluida" ? "soft" : "outline";
  return <Badge variant={variant}>{STATUS_TAREFA_LABEL[status] ?? status}</Badge>;
}

/**
 * Bloco admin/gerente: tarefas concluídas hoje agrupadas por consultor.
 * Mostra contagem destacada + accordion expandindo cada consultor com a
 * lista de tarefas (lead, ação, observação, hora, link pro lead).
 *
 * Sem tarefas hoje → estado vazio neutro (sem alarme — equipe pode ainda
 * estar começando o dia).
 */
function ConcluidasHojePorConsultor({
  tasks,
  todayYmd,
}: {
  tasks: TaskRowForList[];
  todayYmd?: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, { nome: string; rows: TaskRowForList[] }>();
    for (const t of tasks) {
      const entry = map.get(t.consultorId);
      if (entry) entry.rows.push(t);
      else map.set(t.consultorId, { nome: t.consultorNome, rows: [t] });
    }
    // Ordena por count desc (quem mais entregou no topo).
    return Array.from(map.entries())
      .map(([consultorId, { nome, rows }]) => ({ consultorId, nome, rows }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [tasks]);

  const total = tasks.length;
  const dataLabel = todayYmd
    ? new Date(`${todayYmd}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
      })
    : "hoje";

  return (
    <div className="surface-solid rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Trophy className="size-4 text-gold-700 dark:text-gold-400" strokeWidth={1.75} />
            Conclusões de {dataLabel}
          </h2>
          <p className="font-serif italic text-xs text-muted-foreground mt-0.5">
            Visão admin: o que cada consultor entregou hoje.
          </p>
        </div>
        <Badge variant={total > 0 ? "soft-gold" : "outline"} className="text-sm">
          {total} concluída{total === 1 ? "" : "s"}
        </Badge>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed border-foreground/15 px-4 py-6 text-center space-y-1">
          <p className="font-display text-sm font-semibold">
            Nenhuma conclusão registrada hoje
          </p>
          <p className="font-serif italic text-xs text-muted-foreground">
            Conforme consultores forem concluindo tarefas, aparecem aqui em
            tempo real (com a próxima atualização da página).
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => (
            <ConsultorAccordion
              key={g.consultorId}
              nome={g.nome}
              rows={g.rows}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConsultorAccordion({
  nome,
  rows,
}: {
  nome: string;
  rows: TaskRowForList[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-foreground/8 bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-foreground/3 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" strokeWidth={1.75} />
          </div>
          <div className="text-left min-w-0">
            <p className="font-medium truncate">{nome}</p>
            <p className="text-xs text-muted-foreground">
              {rows.length} tarefa{rows.length === 1 ? "" : "s"} concluída
              {rows.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <ul className="divide-y divide-foreground/5 border-t border-foreground/5">
          {rows.map((t) => (
            <li key={t.id} className="px-4 py-3 hover:bg-foreground/3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/leads/${t.leadId}`}
                      prefetch={false}
                      className="font-medium hover:underline truncate"
                    >
                      {t.leadNome}
                    </Link>
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LEAD_LABEL[t.leadStatus] ?? t.leadStatus}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatBrlShort(t.valorCreditoCentavos)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">Ação:</span>{" "}
                    {t.acaoConclusao
                      ? ACAO_TAREFA_LABEL[t.acaoConclusao]
                      : "—"}
                  </p>
                  {t.observacaoConclusao && (
                    <p className="text-sm text-muted-foreground italic line-clamp-2">
                      “{t.observacaoConclusao}”
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {t.titulo} · concluída{" "}
                    {t.concluidaEm
                      ? formatRelative(t.concluidaEm)
                      : "—"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`/leads/${t.leadId}`} prefetch={false}>
                      <ExternalLink className="size-4" />
                    </Link>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompleteTaskDialog({
  task,
  onOpenChange,
  onDone,
}: {
  task: TaskRowForList;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [acao, setAcao] = useState<AcaoTarefa | "">("");
  const [observacao, setObservacao] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!acao) {
      toast.error("Selecione a ação realizada");
      return;
    }
    if (acao === "outro" && !observacao.trim()) {
      toast.error("Observação obrigatória para Outro");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/tarefas/${task.id}/concluir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acao, observacao: observacao.trim() || null }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não foi possível concluir", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success("Tarefa concluída");
    onDone();
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir tarefa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p className="font-medium">{task.leadNome}</p>
            <p className="text-muted-foreground">{task.titulo}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Ação realizada</Label>
            <Select value={acao} onValueChange={(v) => setAcao(v as AcaoTarefa)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Observação {acao === "outro" ? "(obrigatória)" : "(opcional)"}
            </Label>
            <Textarea
              rows={4}
              value={observacao}
              onChange={(e) => setObservacao(e.currentTarget.value)}
              placeholder="Resumo rápido do contato, cobrança ou atualização..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
