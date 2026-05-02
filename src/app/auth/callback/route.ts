import { NextResponse, type NextRequest } from "next/server";

import { extractRequestMeta, logAudit } from "@/lib/audit";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Sanitiza next contra open redirect — qualquer URL externa vira "/leads".
  const next = safeNext(url.searchParams.get("next"));
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", errorDescription ?? error);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "Código de autenticação ausente.");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(loginUrl);
  }

  if (data.user) {
    const meta = extractRequestMeta(request);
    // await: login é evento crítico LGPD, não pode ser fire-and-forget.
    await logAudit({
      usuarioId: data.user.id,
      acao: "login",
      recursoTipo: "sessao",
      metadata: { metodo: "oauth_google" },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return NextResponse.redirect(new URL(next, request.url));
}
