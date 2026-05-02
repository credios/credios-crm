/* eslint-disable react-hooks/set-state-in-effect */
// Effect faz fetch async + subscribe Realtime. setState chega via callback
// assíncrono — padrão "subscribe to external system", lint não distingue.
"use client";

import { Bell, BellRing, Check, Inbox } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBrlShort } from "@/lib/formatters/currency";
import { formatRelative } from "@/lib/formatters/date";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type LeadNovo = {
  id: string;
  nome: string;
  origem: string | null;
  consultorId: string | null;
  valorCreditoCentavos: number | null;
  createdAt: string;
  atribuidoEm: string | null;
  assignedToMe: boolean;
  unread: boolean;
};

type Perfil = "admin" | "gerente" | "consultor" | "marketing";

export function NotificationsBell() {
  const [leads, setLeads] = useState<LeadNovo[]>([]);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  // Lazy init: client Supabase só roda no browser, evita problema de SSR.
  const [supabase] = useState(() => createClient());
  // Timeout pra auto-mark-as-read após dropdown ficar aberto X segundos.
  const autoMarkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/notifications/leads-novos", {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as {
      data: LeadNovo[];
      perfil: Perfil;
      unreadCount: number;
    };
    setLeads(json.data ?? []);
    setPerfil(json.perfil);
    setUnreadCount(json.unreadCount ?? 0);
    seenIds.current = new Set((json.data ?? []).map((l) => l.id));
  }, []);

  const markAsRead = useCallback(async () => {
    // Otimista: zera badge na UI, depois confirma no server.
    setUnreadCount(0);
    setLeads((prev) => prev.map((l) => ({ ...l, unread: false })));
    try {
      await fetch("/api/notifications/seen", { method: "POST" });
    } catch {
      // Falha não regrede o badge — refetch ajusta na próxima abertura.
    }
  }, []);

  useEffect(() => {
    void refetch();
    // Realtime em `leads`: refetch quando um lead novo for inserido.
    const channel = supabase
      .channel("realtime-leads-novos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        async (payload) => {
          await refetch();
          const row = payload.new as { id?: string; nome?: string };
          if (row?.id && !seenIds.current.has(row.id)) {
            seenIds.current.add(row.id);
            toast("Novo lead chegou", {
              description: row.nome ?? "Veja na lista de leads.",
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch, supabase]);

  // Auto-mark-as-read 2.5s após abrir dropdown — UX comum (Twitter/YouTube):
  // user vê os badges destacados, depois eles silenciam.
  useEffect(() => {
    if (open && unreadCount > 0) {
      autoMarkTimer.current = setTimeout(() => {
        void markAsRead();
      }, 2500);
    }
    return () => {
      if (autoMarkTimer.current) clearTimeout(autoMarkTimer.current);
    };
  }, [open, unreadCount, markAsRead]);

  const total = leads.length;
  const Icon = unreadCount > 0 ? BellRing : Bell;

  // Texto contextual no header do dropdown
  const headerText =
    perfil === "consultor"
      ? unreadCount === 0
        ? total === 0
          ? "Nenhum lead novo atribuído"
          : `${total} lead${total === 1 ? "" : "s"} no histórico (24h)`
        : `${unreadCount} novo${unreadCount === 1 ? "" : "s"} pra você`
      : unreadCount === 0
        ? total === 0
          ? "Nenhum lead novo nas últimas 24h"
          : `${total} lead${total === 1 ? "" : "s"} no histórico (24h)`
        : `${unreadCount} novo${unreadCount === 1 ? "" : "s"} nas últimas 24h`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              unreadCount > 0
                ? `${unreadCount} lead${unreadCount === 1 ? "" : "s"} novo${unreadCount === 1 ? "" : "s"} não lido${unreadCount === 1 ? "" : "s"}`
                : "Notificações"
            }
            className="relative"
          >
            <Icon
              className={
                unreadCount > 0
                  ? "size-5 text-gold-700 dark:text-gold-400 animate-bell-bounce"
                  : "size-5"
              }
              strokeWidth={1.75}
            />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-mono font-medium tabular-nums text-destructive-foreground animate-scale-in">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <DropdownMenuLabel className="px-0 py-0">
            {headerText}
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void markAsRead()}
              title="Marcar como lido"
            >
              <Check className="size-3.5" />
              Marcar lido
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {total === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-sm">
            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/15">
              <Inbox className="size-4 text-emerald-700 dark:text-emerald-300" />
            </div>
            <p className="font-serif italic text-muted-foreground">
              Tudo em dia ✓
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {leads.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/leads/${l.id}`}
                  prefetch={false}
                  className={cn(
                    "block px-2 py-2 hover:bg-accent/50 rounded-md transition-colors",
                    // Ponto dourado discreto à esquerda quando não-lido
                    l.unread && "relative bg-gold-500/5",
                  )}
                  onClick={() => setOpen(false)}
                >
                  {l.unread && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-gold-600 dark:bg-gold-400"
                      aria-hidden
                    />
                  )}
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm truncate",
                        l.unread ? "font-semibold" : "font-medium text-muted-foreground",
                      )}
                    >
                      {l.nome}
                    </p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelative(l.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {l.origem && (
                      <Badge variant="soft" className="text-[10px]">
                        {l.origem}
                      </Badge>
                    )}
                    {l.assignedToMe && (
                      <Badge variant="soft-gold" className="text-[10px] uppercase">
                        atribuído a você
                      </Badge>
                    )}
                    {l.valorCreditoCentavos != null && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatBrlShort(l.valorCreditoCentavos)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
