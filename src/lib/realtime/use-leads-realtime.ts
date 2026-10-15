"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { assinarCanalCrm } from "./canal-crm";

/**
 * Ouve o canal privado `crm:leads` (lead criado/alterado/excluído ou
 * interação nova — ver migration 0056) e dispara router.refresh()
 * (debounced) quando algo muda.
 */
export function useLeadsRealtime() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cancelar = assinarCanalCrm(
      "crm:leads",
      () => scheduleRefresh(),
      setConnected,
    );

    function scheduleRefresh() {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => router.refresh(), 400);
    }

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      cancelar();
    };
  }, [router]);

  return { connected };
}
