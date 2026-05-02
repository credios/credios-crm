"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Inscreve em mudanças nas tabelas leads + interacoes via Supabase Realtime
 * e dispara router.refresh() (debounced) quando algo muda.
 *
 * Pré-requisito: Replication habilitada nas tabelas no Supabase Dashboard
 * (Database → Replication). Sem isso o canal conecta mas nunca recebe events.
 */
export function useLeadsRealtime() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-leads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "interacoes" },
        () => scheduleRefresh(),
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    function scheduleRefresh() {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => router.refresh(), 400);
    }

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return { connected };
}
