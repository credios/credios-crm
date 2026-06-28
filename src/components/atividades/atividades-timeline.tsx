"use client";

import {
  Calculator,
  FileText,
  Handshake,
  type LucideIcon,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatLong } from "@/lib/formatters/date";
import {
  ATIVIDADE_TIPO_LABEL,
  type Atividade,
  type AtividadeTipo,
} from "@/lib/atividades/types";
import { cn } from "@/lib/utils";

type Props = {
  atividades: Atividade[];
};

const TIPO_ICON: Record<AtividadeTipo, LucideIcon> = {
  whatsapp: MessageSquare,
  ligacao: Phone,
  email: Mail,
  reuniao: Users,
  contato: Handshake,
  documento_recebido: FileText,
  simulacao: Calculator,
  anotacao: StickyNote,
};

// Cores discretas por tipo — ajudam a escanear visualmente.
const TIPO_BG: Record<AtividadeTipo, string> = {
  whatsapp: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  ligacao: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  email: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  reuniao: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  contato: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  documento_recebido: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  simulacao: "bg-gold-500/15 text-gold-700 dark:text-gold-400",
  anotacao: "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
};

function initials(nome: string | null): string {
  if (!nome) return "?";
  const parts = nome.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** "16:42" — só hora local. Data completa fica no tooltip via formatLong. */
function formatHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "12/05" — usado pra separar grupos por dia. */
function formatDia(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDiaLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function AtividadesTimeline({ atividades }: Props) {
  if (atividades.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-1.5">
          <p className="font-display text-sm font-semibold">
            Nenhuma atividade no período
          </p>
          <p className="font-serif italic text-xs text-muted-foreground">
            Ajuste o filtro de período ou consultor pra ver mais atividades.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Agrupa por dia pra inserir separador "Hoje · 12/05" entre grupos.
  // Útil quando o filtro é multi-dia (semana, mês).
  const grupos = groupByDia(atividades);

  return (
    <Card>
      <CardContent className="py-2">
        <ul className="divide-y divide-foreground/5">
          {grupos.map((g) => (
            <li key={g.dia} className="py-2">
              <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
                {formatDiaLong(g.atividades[0]!.hora)}
              </div>
              <ul className="space-y-0.5">
                {g.atividades.map((a) => (
                  <AtividadeRow key={a.id} atividade={a} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AtividadeRow({ atividade }: { atividade: Atividade }) {
  const Icon = TIPO_ICON[atividade.tipo];
  return (
    <li>
      <Link
        href={`/leads/${atividade.lead.id}`}
        className="group flex items-start gap-3 rounded-md px-3 py-2 hover:bg-foreground/4 transition-colors"
      >
        <span
          className="font-mono text-[11px] tabular-nums text-muted-foreground w-12 shrink-0 pt-0.5"
          title={formatLong(atividade.hora)}
        >
          {formatHora(atividade.hora)}
        </span>

        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            TIPO_BG[atividade.tipo],
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
        </span>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <span className="flex items-center gap-1">
              <Avatar className="size-4 ring-1 ring-foreground/10">
                <AvatarFallback className="text-[9px] font-medium">
                  {initials(atividade.consultor.nome)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{atividade.consultor.nome ?? "—"}</span>
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">
              {ATIVIDADE_TIPO_LABEL[atividade.tipo]}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="text-primary group-hover:underline">
              {atividade.lead.nome}
            </span>
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
              {atividade.lead.status.replace(/_/g, " ")}
            </Badge>
          </div>
          {atividade.titulo && (
            <p className="text-sm font-medium text-foreground line-clamp-1">
              {atividade.titulo}
            </p>
          )}
          {atividade.detalhe && (
            <p
              className={cn(
                "text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap leading-relaxed",
              )}
            >
              {atividade.detalhe}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

function groupByDia(atividades: Atividade[]): { dia: string; atividades: Atividade[] }[] {
  const out: { dia: string; atividades: Atividade[] }[] = [];
  let current: { dia: string; atividades: Atividade[] } | null = null;
  for (const a of atividades) {
    const dia = formatDia(a.hora);
    if (!current || current.dia !== dia) {
      current = { dia, atividades: [] };
      out.push(current);
    }
    current.atividades.push(a);
  }
  return out;
}
