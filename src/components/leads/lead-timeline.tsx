"use client";

import {
  Bell,
  FileText,
  Loader2,
  type LucideIcon,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  StickyNote,
  Users,
  UserSquare,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatLong, formatRelative } from "@/lib/formatters/date";
import { useInteracoesRealtime } from "@/lib/realtime/use-interacoes-realtime";
import { cn } from "@/lib/utils";

export type Interacao = {
  id: string;
  tipo: string;
  conteudo: string | null;
  metadata: unknown;
  criadoEm: string | Date;
  autorId: string | null;
  autorNome: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  ligacao: "Ligação",
  whatsapp_enviado: "WhatsApp enviado",
  whatsapp_recebido: "WhatsApp recebido",
  email: "Email",
  reuniao: "Reunião",
  anotacao: "Anotação",
  documento_recebido: "Documento recebido",
  mudanca_status: "Mudança de status",
  mudanca_atribuicao: "Reatribuição",
  evento_sistema: "Evento do sistema",
};

const TIPO_ICON: Record<string, LucideIcon> = {
  ligacao: Phone,
  whatsapp_enviado: Send,
  whatsapp_recebido: MessageSquare,
  email: Mail,
  reuniao: Users,
  anotacao: StickyNote,
  documento_recebido: FileText,
  mudanca_status: RefreshCw,
  mudanca_atribuicao: UserSquare,
  evento_sistema: Bell,
};

const SISTEMA_TIPOS = new Set(["mudanca_status", "mudanca_atribuicao", "evento_sistema"]);

const TIPOS_MANUAIS = [
  "ligacao",
  "whatsapp_enviado",
  "whatsapp_recebido",
  "email",
  "reuniao",
  "anotacao",
  "documento_recebido",
];

function initials(nome: string | null): string {
  if (!nome) return "S";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  leadId: string;
  initial: Interacao[];
  canCreate: boolean;
  /** Quando true, renderiza botão "Carregar mais" (initial.length === pageSize). */
  mayHaveMore?: boolean;
  pageSize?: number;
};

export function LeadTimeline({
  leadId,
  initial,
  canCreate,
  mayHaveMore = false,
  pageSize = 30,
}: Props) {
  // `extras` acumula interações chegadas via realtime (não-server-fetched).
  // `older` acumula páginas mais antigas carregadas via "Carregar mais".
  // `flashIds` rastreia IDs novos pra aplicar animação de destaque uma vez só.
  const [extras, setExtras] = useState<Interacao[]>([]);
  const [older, setOlder] = useState<Interacao[]>([]);
  const [hasMore, setHasMore] = useState(mayHaveMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tipo, setTipo] = useState<string>("anotacao");
  const [conteudo, setConteudo] = useState("");
  const [pending, setPending] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  const interacoes = useMemo(() => {
    const seen = new Set<string>();
    const out: Interacao[] = [];
    // Ordem: extras (mais novos) -> initial (primeira página) -> older (paginação)
    for (const i of [...extras, ...initial, ...older]) {
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      out.push(i);
    }
    return out;
  }, [initial, extras, older]);

  const onRealtimeNew = useCallback((row: Record<string, unknown>) => {
    const novo: Interacao = {
      id: String(row.id),
      tipo: String(row.tipo),
      conteudo: (row.conteudo as string | null) ?? null,
      metadata: row.metadata,
      criadoEm: String(row.criado_em ?? new Date().toISOString()),
      autorId: (row.autor_id as string | null) ?? null,
      autorNome: null, // realtime não traz JOIN — exibe placeholder; refresh popula
    };
    setExtras((prev) => (prev.some((p) => p.id === novo.id) ? prev : [novo, ...prev]));
    // Marca pra animação. Limpa flag após 1.6s (animação dura 320ms; janela
    // generosa garante render mesmo em re-render).
    setFlashIds((prev) => {
      const next = new Set(prev);
      next.add(novo.id);
      return next;
    });
    setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(novo.id);
        return next;
      });
    }, 1600);
  }, []);

  useInteracoesRealtime(leadId, onRealtimeNew);

  async function handleSubmit() {
    if (!conteudo.trim() && tipo === "anotacao") {
      toast.error("Anotação precisa de conteúdo");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/leads/${leadId}/interacoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo, conteudo: conteudo.trim() || null }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Erro ao registrar", {
        description: typeof json.error === "string" ? json.error : undefined,
      });
      return;
    }
    toast.success("Interação registrada");
    setConteudo("");
    // Realtime + refresh do server vão atualizar a lista.
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    // Cursor: a interação mais antiga atualmente carregada.
    const ordered = [...interacoes].sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
    );
    const oldest = ordered[0];
    const cursor = oldest?.criadoEm;
    const url = new URL(
      `/api/leads/${leadId}/interacoes`,
      window.location.origin,
    );
    if (cursor) url.searchParams.set("before", String(cursor));
    url.searchParams.set("limit", String(pageSize));
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        toast.error("Não foi possível carregar mais");
        return;
      }
      const json = (await res.json()) as {
        data: Interacao[];
        hasMore: boolean;
      };
      setOlder((prev) => [...prev, ...json.data]);
      setHasMore(json.hasMore);
    } catch {
      toast.error("Erro de rede ao carregar mais");
    } finally {
      setLoadingMore(false);
    }
  }

  // Reverso cronológico (mais recente primeiro).
  const ordered = [...interacoes].sort(
    (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {canCreate && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v ?? "anotacao")} disabled={pending}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_MANUAIS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="Anotação, descrição da ligação, conteúdo da mensagem…"
              rows={3}
              value={conteudo}
              onChange={(e) => setConteudo(e.currentTarget.value)}
              disabled={pending}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSubmit} disabled={pending}>
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                Registrar
              </Button>
            </div>
          </div>
        )}

        {ordered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 px-4 py-8 text-center space-y-1.5">
            <p className="font-display text-sm font-semibold">
              Nada registrado ainda
            </p>
            <p className="font-serif italic text-xs text-muted-foreground">
              Use o formulário acima pra registrar a primeira ligação,
              mensagem ou anotação deste lead.
            </p>
          </div>
        ) : (
          <>
            <ul className="relative space-y-4 before:absolute before:left-[13px] before:top-2 before:bottom-2 before:w-px before:bg-foreground/10">
              {ordered.map((i) => (
                <TimelineItem
                  key={i.id}
                  interacao={i}
                  flash={flashIds.has(i.id)}
                />
              ))}
            </ul>
            {hasMore && (
              <div className="pt-2 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
                  Carregar mais antigas
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineItem({
  interacao,
  flash,
}: {
  interacao: Interacao;
  flash?: boolean;
}) {
  const Icon = TIPO_ICON[interacao.tipo] ?? StickyNote;
  const sistema = SISTEMA_TIPOS.has(interacao.tipo);
  const label = TIPO_LABEL[interacao.tipo] ?? interacao.tipo;
  return (
    <li
      className={cn(
        "relative flex gap-3 pl-0 rounded-md transition-colors",
        // Highlight discreto pra interação recém-criada (via realtime).
        // Anim suporta `prefers-reduced-motion` via :global no globals.css.
        flash && "animate-timeline-flash",
      )}
    >
      <div
        className={cn(
          "relative z-10 size-7 rounded-full flex items-center justify-center shrink-0 ring-2 ring-background transition-transform",
          sistema
            ? "bg-bg-muted text-muted-foreground"
            : "bg-blue-50 text-primary dark:bg-blue-950/40",
          flash && "scale-110",
        )}
      >
        <Icon className="size-3.5" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0 space-y-1 pt-0.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={cn(
              "text-sm font-medium",
              sistema && "text-muted-foreground",
            )}
          >
            {label}
          </span>
          <span
            className="font-mono text-[11px] text-muted-foreground"
            title={formatLong(interacao.criadoEm)}
          >
            {formatRelative(interacao.criadoEm)}
          </span>
          {interacao.autorNome && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Avatar className="size-4 ring-1 ring-foreground/10">
                <AvatarFallback className="text-[9px] font-medium">
                  {initials(interacao.autorNome)}
                </AvatarFallback>
              </Avatar>
              {interacao.autorNome}
            </span>
          )}
        </div>
        {interacao.conteudo && (
          <p
            className={cn(
              "text-sm whitespace-pre-wrap leading-relaxed",
              sistema && "text-muted-foreground",
            )}
          >
            {interacao.conteudo}
          </p>
        )}
      </div>
    </li>
  );
}
