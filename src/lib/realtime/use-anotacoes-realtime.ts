"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Inscreve em INSERT/UPDATE/DELETE em public.lead_anotacoes pra um lead.
 * Diferente de interações (só INSERT, imutáveis), anotações podem ser
 * editadas (UPDATE) e excluídas (DELETE). Callback recebe o tipo de evento
 * + a row.
 */
export function useAnotacoesRealtime(
  leadId: string,
  onChange: (
    event: "INSERT" | "UPDATE" | "DELETE",
    row: Record<string, unknown>,
  ) => void,
) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime-anotacoes-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_anotacoes",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const event = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          // DELETE traz `old` em vez de `new` (sem nova row).
          const row =
            event === "DELETE"
              ? (payload.old as Record<string, unknown>)
              : (payload.new as Record<string, unknown>);
          onChange(event, row);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, onChange]);
}
