import { NextResponse, type NextRequest } from "next/server";

import { ehHostDoPortal, rotaNoHostDoPortal } from "@/lib/portal-parceiro/host";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Domínio do portal de parceiros: só o portal existe nesse host. Decidido
  // antes de qualquer coisa de sessão — o CRM interno nem é alcançado por ele.
  if (ehHostDoPortal(request.headers.get("host"))) {
    const d = rotaNoHostDoPortal(request.nextUrl.pathname);
    if (d.tipo === "redirecionar") {
      return NextResponse.redirect(
        d.externo ? d.destino : new URL(d.destino, request.url),
      );
    }
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Casa todos os paths exceto:
     * - _next/static, _next/image, favicon.ico
     * - arquivos de imagem (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
