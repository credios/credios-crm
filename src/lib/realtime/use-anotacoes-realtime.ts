"use client";

import { useEffect } from "react";

import { assinarCanalCrm } from "./canal-crm";

/**
 * Anotações de um lead, ao vivo (canal privado `crm:lead:<id>`).
 * Diferente de interações (só INSERT, imutáveis), anotações podem ser
 * editadas (UPDATE) e excluídas (DELETE). Callback recebe o tipo de evento
 * + a linha (no DELETE, a linha que foi apagada).
 */
export function useAnotacoesRealtime(
  leadId: string,
  onChange: (
    event: "INSERT" | "UPDATE" | "DELETE",
    row: Record<string, unknown>,
  ) => void,
) {
  useEffect(
    () =>
      assinarCanalCrm(`crm:lead:${leadId}`, (evento, payload) => {
        if (evento !== "anotacao") return;
        onChange(
          payload.op as "INSERT" | "UPDATE" | "DELETE",
          (payload.row ?? {}) as Record<string, unknown>,
        );
      }),
    [leadId, onChange],
  );
}
