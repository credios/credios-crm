import { type NextRequest } from "next/server";

import { arquivoDaComissao, respostaDeArquivo } from "@/lib/parceiros/comissoes";
import { erro } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

type Ctx = { params: Promise<{ id: string }> };

// GET ?tipo=comprovante|nota — o parceiro baixa arquivo de uma comissão DELE.
export async function GET(request: NextRequest, { params }: Ctx) {
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return erro("não encontrado", 404);
  const tipo = request.nextUrl.searchParams.get("tipo") === "nota" ? "nota" : "comprovante";
  const a = await arquivoDaComissao(id, tipo, sessao.parceiroId);
  if (!a) return erro("não encontrado", 404);
  return respostaDeArquivo(a);
}
