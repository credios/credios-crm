/* eslint-disable react-hooks/set-state-in-effect */
// Effect lê navigator.platform no mount pra escolher kbd label (Mac vs Win/Linux);
// hidratação de preferência do sistema — padrão correto, lint não distingue.
"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";

export function CommandPaletteTrigger() {
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform));
    }
  }, []);

  function open() {
    window.dispatchEvent(new CustomEvent("crm:command-palette:open"));
  }

  return (
    <button
      type="button"
      onClick={open}
      className="group/cmd flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-3 text-left text-sm text-muted-foreground shadow-elev-sm transition-[background,border,color] duration-fast ease-out-soft hover:border-border hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      aria-label="Abrir busca rápida (Command + K)"
    >
      <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="flex-1 truncate">Buscar leads, ações…</span>
      <kbd className="font-mono ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded border border-border/70 bg-muted/60 px-1.5 text-[10px] font-medium text-muted-foreground">
        <span className="text-xs leading-none">{isMac ? "⌘" : "Ctrl"}</span>
        <span>K</span>
      </kbd>
    </button>
  );
}
