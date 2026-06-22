import type { ReactNode } from "react";

// Grão fino (SVG fractalNoise embutido) — textura premium sobre o navy.
// baseFrequency alta + 3 octaves = granulado fino e rico, estilo editorial.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Fundo premium do portal: gradiente navy Credios sofisticado (radial do topo,
 * azul mais aberto em cima → quase-preto embaixo) + grão fino por cima.
 * Monocromático e granulado, na linha da referência (post Selic).
 */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen w-full overflow-hidden font-sans text-white"
      style={{
        backgroundColor: "#0a1834",
        backgroundImage:
          "radial-gradient(120% 85% at 50% -12%, #234982 0%, #173458 22%, #0f234a 48%, #0a1836 73%, #060f26 100%)",
      }}
    >
      {/* halo azul muito sutil, deslocado, pra dar profundidade sem poluir */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(40% 30% at 82% 12%, rgba(75,123,229,0.14), transparent 70%)",
        }}
      />
      {/* grão fino */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.15] mix-blend-overlay"
        style={{ backgroundImage: NOISE, backgroundSize: "180px 180px" }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
