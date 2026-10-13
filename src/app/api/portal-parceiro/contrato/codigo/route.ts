import { NextResponse, type NextRequest } from "next/server";

import { enviarOtp } from "@/lib/portal-parceiro/contrato/servico";
import { erro, limitar, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

// POST /api/portal-parceiro/contrato/codigo — envia o código de assinatura
// (6 dígitos, 10 min) pro e-mail de login do parceiro.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const limite = limitar(request, "contrato-codigo", 10, 15 * 60_000);
  if (limite) return limite;

  const r = await enviarOtp(
    sessao.parceiroId,
    { nome: sessao.nome, email: sessao.email },
    metaDoRequest(request),
  );
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
