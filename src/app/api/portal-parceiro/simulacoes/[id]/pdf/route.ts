import { type NextRequest } from "next/server";

import { precisaAssinarContrato } from "@/lib/portal-parceiro/contrato/servico";
import { erro } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";
import { pdfDaSimulacao, podeSimularCondominio } from "@/lib/portal-parceiro/simulacoes";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/portal-parceiro/simulacoes/[id]/pdf — PDF da PRÓPRIA simulação.
// ?download=1 baixa; sem ele abre no visualizador do navegador.
export async function GET(request: NextRequest, { params }: Ctx) {
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  if (!podeSimularCondominio(sessao)) return erro("forbidden", 403);
  if (await precisaAssinarContrato(sessao.parceiroId, sessao.produtosHabilitados)) {
    return erro("Assine o contrato de parceria antes de simular.", 403);
  }
  const { id } = await params;
  const pdf = await pdfDaSimulacao(id, sessao.parceiroId);
  if (!pdf) return erro("não encontrado", 404);

  const modo = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${modo}; filename="${pdf.nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
