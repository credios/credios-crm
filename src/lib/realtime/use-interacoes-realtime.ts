"use client";

import { useEffect } from "react";

import { assinarCanalCrm } from "./canal-crm";

/**
 * Interações novas de um lead, ao vivo (canal privado `crm:lead:<id>`).
 * Cada nova interação chama `onNew` com a linha gravada no banco.
 */
export function useInteracoesRealtime(
  leadId: string,
  onNew: (row: Record<string, unknown>) => void,
) {
  useEffect(
    () =>
      assinarCanalCrm(`crm:lead:${leadId}`, (evento, payload) => {
        if (evento === "interacao") onNew(payload);
      }),
    [leadId, onNew],
  );
}
