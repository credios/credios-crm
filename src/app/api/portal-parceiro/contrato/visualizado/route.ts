import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { registrarVisualizacao } from "@/lib/portal-parceiro/contrato/servico";
import { erro, lerJson, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

const schema = z.object({ contratoId: z.uuid() });

// POST /api/portal-parceiro/contrato/visualizado — o navegador avisa que o
// contrato foi exibido. Fica fora do render da página de propósito: o Next
// pré-carrega páginas pelo menu, e isso marcaria "aberto" sem ninguém abrir.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("inválido");
  await registrarVisualizacao(sessao.parceiroId, parsed.data.contratoId, metaDoRequest(request));
  return NextResponse.json({ ok: true });
}
