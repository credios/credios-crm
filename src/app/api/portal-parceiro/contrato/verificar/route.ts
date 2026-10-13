import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { verificarOtp } from "@/lib/portal-parceiro/contrato/servico";
import { erro, lerJson, limitar, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

const schema = z.object({ codigo: z.string().min(6).max(12) });

// POST /api/portal-parceiro/contrato/verificar — confere o código (5 tentativas).
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const limite = limitar(request, "contrato-verificar", 30, 15 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Informe o código de 6 dígitos.");
  const r = await verificarOtp(sessao.parceiroId, parsed.data.codigo, metaDoRequest(request));
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
