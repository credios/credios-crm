/* eslint-disable react-hooks/set-state-in-effect */
// O effect aqui faz fetch async + subscribe Realtime; setState chega via
// callback assíncrono (não direto no effect body), padrão correto pra "subscribe to
// external system" mas o lint não consegue distinguir.
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

type SlaAlerta = {
  id: string;
  tipo: string;
  disparadoEm: string;
  leadId: string;
  leadNome: string;
  leadStatus: string;
  consultorId: string | null;
  atribuidoEm: string | null;
  valorCreditoCentavos: number | null;
};

export function NotificationsBell() {
  const [alertas, setAlertas] = useState<SlaAlerta[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    const res = await fetch("/api/sla/alertas", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { data: SlaAlerta[] };
    setAlertas(json.data ?? []);
    seenIds.current = new Set((json.data ?? []).map((a) => a.id));
  }, []);

  // Inicial fetch + Realtime subscription. Tudo num único effect — fetch
  // dispara assíncrono via callback (não-síncrono dentro do effect body).
  useEffect(() => {
    const supabase = createClient();
    void refetch();
    const channel = supabase
      .channel("realtime-sla-alertas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sla_alertas" },
        async (payload) => {
          await refetch();
          if (payload.eventType === "INSERT") {
            const row = payload.new as { id?: string };
            if (row?.id && !seenIds.current.has(row.id)) {
              seenIds.current.add(row.id);
              toast.warning("Novo alerta de SLA", {
                description: "Lead sem primeiro contato há mais de 30 minutos.",
              });
            }
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const count = alertas.length;
  const Icon = count > 0 ? BellRing : Bell;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${count} alertas pendentes`}
            className="relative"
          >
            <Icon className={count > 0 ? "size-5 text-amber-600" : "size-5"} />
            {count > 0 && (
              <span className="absolute top-0.5 right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>
          {count === 0 ? "Sem alertas pendentes" : `${count} alertas SLA pendentes`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
            <Inbox className="size-6" />
            Tudo em dia.
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {alertas.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/leads/${a.leadId}`}
                  className="block px-2 py-2 hover:bg-accent/50 rounded-md"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium truncate">{a.leadNome}</p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelative(a.disparadoEm)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {a.tipo === "primeiro_contato_atrasado" ? "1º contato" : a.tipo}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatBrlShort(a.valorCreditoCentavos)}
                    </span>
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
