import { ShieldAlert } from "lucide-react";

import { PortalShell } from "./portal-shell";

/** Tela amigável para token inexistente, expirado ou revogado. */
export function PortalInvalido() {
  return (
    <PortalShell>
      <div className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-[0_8px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-credios-gold/15 ring-1 ring-credios-gold/25">
            <ShieldAlert className="h-7 w-7 text-credios-gold" aria-hidden />
          </div>
          <h1 className="font-display text-xl font-semibold text-white">
            Este link não está mais ativo
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            O link de envio de documentos pode ter expirado ou sido atualizado.
            Não se preocupe — sua proposta segue em andamento. Fale com o seu
            consultor que ele te envia um novo link em segundos.
          </p>
          <p className="mt-6 text-xs text-white/35">
            Credios · Crédito com Garantia de Imóvel
          </p>
        </div>
      </div>
    </PortalShell>
  );
}
