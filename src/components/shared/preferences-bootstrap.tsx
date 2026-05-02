"use client";

import { useEffect } from "react";

export function PreferencesBootstrap() {
  useEffect(() => {
    try {
      const density = localStorage.getItem("credios:density") || "comfortable";
      const theme = localStorage.getItem("credios:theme") || "auto";
      const reduceMotion = localStorage.getItem("credios:reduce-motion") === "true";
      const compactNumbers = localStorage.getItem("credios:compact-numbers") !== "false";
      const html = document.documentElement;

      html.classList.add(`dens-${density}`);
      const dark =
        theme === "dark" ||
        (theme === "auto" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      html.classList.toggle("dark", dark);
      html.classList.toggle("reduce-motion", reduceMotion);
      html.classList.toggle("compact-numbers", compactNumbers);
    } catch {
      // Preferencias visuais nao devem impedir o app de renderizar.
    }
  }, []);

  return null;
}
