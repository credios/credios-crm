import type { ReactNode } from "react";

// Grão sutil (SVG fractalNoise embutido) — dá textura premium ao fundo escuro.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Fundo premium compartilhado do portal: gradiente azul-escuro Credios + grão + glows. */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen w-full overflow-hidden font-sans text-white"
      style={{
        backgroundColor: "#0a1124",
        backgroundImage:
          "radial-gradient(60% 50% at 12% -5%, rgba(75,123,229,0.20), transparent 60%)," +
          "radial-gradient(45% 40% at 100% 8%, rgba(212,163,81,0.10), transparent 55%)," +
          "radial-gradient(90% 60% at 50% 112%, rgba(33,61,128,0.30), transparent 70%)," +
          "linear-gradient(180deg, #0a1124 0%, #0d1730 45%, #0a1020 100%)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045] mix-blend-overlay"
        style={{ backgroundImage: NOISE }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
