/* eslint-disable react-hooks/set-state-in-effect */
// Effect faz fetch async + subscribe Realtime. setState chega via callback
// assíncrono — padrão "subscribe to external system", lint não distingue.
"use client";

import { Bell, BellRing, Inbox } from "lucide-react";
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

type LeadNovo = {
  id: string;
  nome: string;
  origem: string | null;
  consultorId: string | null;
  valorCreditoCentavos: number | null;
  createdAt: string;
  atribuidoEm: string | null;
  assignedToMe: boolean;
};

type Perfil = "admin" | "gerente" | "consultor" | "marketing";

export function NotificationsBell() {
  const [leads, setLeads] = useState<LeadNovo[]>([]);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    const res = await fetch("/api/notifications/leads-novos", {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { data: LeadNovo[]; perfil: Perfil };
    setLeads(json.data ?? []);
    setPerfil(json.perfil);
    seenIds.current = new Set((json.data ?? []).map((l) => l.id));
  }, []);

  useEffect(() => {
    const supabase = createClient();
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
  }, [refetch]);

  const count = leads.length;
  const Icon = count > 0 ? BellRing : Bell;

  // Texto contextual no header do dropdown
  const headerText =
    perfil === "consultor"
      ? count === 0
        ? "Nenhum lead novo atribuído"
        : `${count} lead${count === 1 ? "" : "s"} novo${count === 1 ? "" : "s"} pra você`
      : count === 0
        ? "Nenhum lead novo nas últimas 24h"
        : `${count} lead${count === 1 ? "" : "s"} novo${count === 1 ? "" : "s"} nas últimas 24h`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${count} lead${count === 1 ? "" : "s"} novo${count === 1 ? "" : "s"}`}
            className="relative"
          >
            <Icon
              className={
                count > 0
                  ? "size-5 text-gold-700 dark:text-gold-400 animate-bell-bounce"
                  : "size-5"
              }
              strokeWidth={1.75}
            />
            {count > 0 && (
              <span className="absolute top-0.5 right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-mono font-medium tabular-nums text-destructive-foreground animate-scale-in">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{headerText}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
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
                  className="block px-2 py-2 hover:bg-accent/50 rounded-md"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium truncate">{l.nome}</p>
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
