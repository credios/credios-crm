import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { enviarOtp } from "@/lib/portal-parceiro/contrato/servico";
import { erro, lerJson, limitar, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

const schema = z.object({ contratoId: z.uuid() });

// POST /api/portal-parceiro/contrato/codigo — envia o código de assinatura
// (6 dígitos, 10 min) pro e-mail de login do parceiro. O contrato vem
// identificado: o código vale pro documento que estava na tela.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const limite = limitar(request, "contrato-codigo", 10, 15 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Recarregue a página e tente de novo.");
  const r = await enviarOtp(
    sessao.parceiroId,
    parsed.data.contratoId,
    { nome: sessao.nome, email: sessao.email },
    metaDoRequest(request),
  );
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
