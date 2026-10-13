import { type NextRequest } from "next/server";

import { pdfDoContrato } from "@/lib/portal-parceiro/contrato/servico";
import { erro } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/portal-parceiro/contrato/[id]/pdf — o parceiro baixa o PRÓPRIO
// contrato (via final se concluído; senão a minuta).
export async function GET(_request: NextRequest, { params }: Ctx) {
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return erro("não encontrado", 404);

  const pdf = await pdfDoContrato(id, sessao.parceiroId);
  if (!pdf) return erro("não encontrado", 404);
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdf.nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
