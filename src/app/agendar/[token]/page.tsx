import type { Metadata } from "next";

import { AgendarClient } from "./agendar-client";

// Página PÚBLICA de agendamento (cliente) — destino do {{link_agenda}} enviado
// pela cadência de follow-up e reutilizável em qualquer convite manual. Mesmo
// motor da agenda do simulador (/api/public/agenda). Sem auth (gate = token
// HMAC na URL); noindex.

export const metadata: Metadata = {
  title: "Agendar conversa — Credios",
  robots: { index: false, follow: false },
};

export default async function AgendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AgendarClient token={token} />;
}
