// GET /api/version — retorna SHA do build atual.
// Usado pelo client-side useStaleVersionDetector pra avisar quando há
// deploy novo enquanto o usuário está com aba aberta.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  // Vercel injeta VERCEL_GIT_COMMIT_SHA em todo deploy. Em local/CI sem
  // Vercel, cai pro literal "dev" (sempre igual → detector nunca dispara).
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_BUILD_ID ??
    "dev";
  return NextResponse.json(
    { version },
    {
      // Sem cache — sempre fresca.
      headers: { "cache-control": "no-store, max-age=0" },
    },
  );
}
