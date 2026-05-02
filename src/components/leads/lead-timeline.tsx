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
};

export function LeadTimeline({ leadId, initial, canCreate }: Props) {
  // `extras` acumula interações chegadas via realtime (não-server-fetched).
  // Ao próximo router.refresh(), `initial` traz tudo já com autorNome via JOIN
  // e o merge filtra extras duplicadas.
  const [extras, setExtras] = useState<Interacao[]>([]);
  const [tipo, setTipo] = useState<string>("anotacao");
  const [conteudo, setConteudo] = useState("");
  const [pending, setPending] = useState(false);

  const interacoes = useMemo(() => {
    const initialIds = new Set(initial.map((i) => i.id));
    const novos = extras.filter((e) => !initialIds.has(e.id));
    return [...initial, ...novos];
  }, [initial, extras]);

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
    setExtras((prev) => (prev.some((p) => p.id === novo.id) ? prev : [...prev, novo]));
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
          <p className="text-sm text-muted-foreground italic">Sem interações ainda.</p>
        ) : (
          <ul className="space-y-3">
            {ordered.map((i) => (
              <TimelineItem key={i.id} interacao={i} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineItem({ interacao }: { interacao: Interacao }) {
  const Icon = TIPO_ICON[interacao.tipo] ?? StickyNote;
  const sistema = SISTEMA_TIPOS.has(interacao.tipo);
  const label = TIPO_LABEL[interacao.tipo] ?? interacao.tipo;
  return (
    <li className="flex gap-3">
      <div
        className={cn(
          "size-7 rounded-full flex items-center justify-center shrink-0",
          sistema ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn("text-sm font-medium", sistema && "text-muted-foreground")}>
            {label}
          </span>
          <span className="text-xs text-muted-foreground" title={formatLong(interacao.criadoEm)}>
            {formatRelative(interacao.criadoEm)}
          </span>
          {interacao.autorNome && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Avatar className="size-4">
                <AvatarFallback className="text-[9px]">{initials(interacao.autorNome)}</AvatarFallback>
              </Avatar>
              {interacao.autorNome}
            </span>
          )}
        </div>
        {interacao.conteudo && (
          <p className={cn("text-sm whitespace-pre-wrap", sistema && "text-muted-foreground")}>
            {interacao.conteudo}
          </p>
        )}
      </div>
    </li>
  );
}
