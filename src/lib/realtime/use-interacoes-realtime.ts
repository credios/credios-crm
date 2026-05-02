"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Inscreve em INSERTs em public.interacoes para um lead específico.
 * Cada nova interação chama `onNew` com a row vinda do Postgres.
 */
export function useInteracoesRealtime(
  leadId: string,
  onNew: (row: Record<string, unknown>) => void,
) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime-interacoes-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "interacoes",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => onNew(payload.new as Record<string, unknown>),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, onNew]);
}
