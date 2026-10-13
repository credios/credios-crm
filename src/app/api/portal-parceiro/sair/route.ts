import { NextResponse, type NextRequest } from "next/server";

import { erro, origemInvalida } from "@/lib/portal-parceiro/http";
import { encerrarSessao } from "@/lib/portal-parceiro/sessao";

// POST /api/portal-parceiro/sair
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  await encerrarSessao();
  return NextResponse.json({ ok: true });
}
