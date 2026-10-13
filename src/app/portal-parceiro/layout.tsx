import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Portal de Parceiros — Credios", template: "%s — Parceiros Credios" },
  robots: { index: false, follow: false },
};

// Portal do parceiro: área separada do CRM interno (login e sessão próprios).
export default function PortalParceiroLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
