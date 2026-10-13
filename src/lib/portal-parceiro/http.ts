import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { clientIp, rateLimit } from "@/lib/rate-limit";

// Utilitários das rotas /api/portal-parceiro/*. Essas rotas são públicas no
// middleware (o gate é a sessão do parceiro, checada em cada handler).

export function metaDoRequest(request: NextRequest) {
  return {
    ip: clientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
  };
}

/**
 * Barreira anti-CSRF pras rotas que mudam estado: o cookie é SameSite=Lax,
 * mas conferir o Origin fecha também o caso de subdomínio/site comprometido.
 * Navegador sempre manda Origin em POST; ausente (curl) passa.
 */
export function origemInvalida(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

/** 429 se o IP estourou o limite; senão null. */
export function limitar(
  request: NextRequest,
  chave: string,
  max: number,
  janelaMs: number,
): NextResponse | null {
  if (rateLimit(`pp:${chave}:${clientIp(request.headers)}`, max, janelaMs)) return null;
  return NextResponse.json(
    { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
    { status: 429 },
  );
}

export async function lerJson(request: NextRequest): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export const erro = (mensagem: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: mensagem, ...extra }, { status });
