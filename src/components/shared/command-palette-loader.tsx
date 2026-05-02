"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CommandPalette = dynamic(
  () => import("./command-palette").then((m) => m.CommandPalette),
  { ssr: false },
);

export function CommandPaletteLoader() {
  const [enabled, setEnabled] = useState(false);
  const [openOnMount, setOpenOnMount] = useState(false);

  useEffect(() => {
    function openPalette() {
      setOpenOnMount(true);
      setEnabled(true);
    }

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener(
      "crm:command-palette:open",
      openPalette as EventListener,
    );

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(
        "crm:command-palette:open",
        openPalette as EventListener,
      );
    };
  }, []);

  return enabled ? <CommandPalette defaultOpen={openOnMount} /> : null;
}
