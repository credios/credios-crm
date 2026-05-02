/* eslint-disable react-hooks/set-state-in-effect */
// O effect faz fetch async + clear ao limpar busca; setState chega via
// callback ou reset síncrono — padrão correto pra "subscribe" mas o lint
// não distingue.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { STATUS_LEAD_LABEL } from "@/lib/constants";

type LeadHit = {
  id: string;
  nome: string;
  status: string;
  email: string | null;
  whatsapp: string | null;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [loading, setLoading] = useState(false);

  // Atalho global: Cmd/Ctrl + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounce search
  useEffect(() => {
    if (!open) return;
    if (!query || query.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/leads?q=${encodeURIComponent(query)}&pageSize=10`,
        { cache: "no-store" },
      );
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setHits([]);
        return;
      }
      const json = (await res.json()) as { data: LeadHit[] };
      setHits(json.data ?? []);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  function pick(leadId: string) {
    router.push(`/leads/${leadId}`);
    setOpen(false);
    setQuery("");
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar lead por nome, email, CPF, telefone…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.length < 2 ? (
          <CommandEmpty>Digite ao menos 2 caracteres.</CommandEmpty>
        ) : loading ? (
          <CommandEmpty>Buscando…</CommandEmpty>
        ) : hits.length === 0 ? (
          <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
        ) : (
          <CommandGroup heading="Leads">
            {hits.map((h) => (
              <CommandItem key={h.id} value={`${h.nome} ${h.email ?? ""} ${h.id}`} onSelect={() => pick(h.id)}>
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {h.email ?? h.whatsapp ?? "—"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {STATUS_LEAD_LABEL[h.status] ?? h.status}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
