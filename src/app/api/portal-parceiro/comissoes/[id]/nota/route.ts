import { and, eq, ne } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { parceiroComissoes, parceiroInteracoes } from "../../../../../../../db/schema";
import { db } from "@/lib/db";
import { lerUpload } from "@/lib/parceiros/comissoes";
import { erro, limitar, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

type Ctx = { params: Promise<{ id: string }> };

// POST (multipart) — o parceiro anexa a nota fiscal de uma comissão DELE
// (o contrato condiciona o pagamento de PJ à nota). PDF/PNG/JPG até 5 MB.
export async function POST(request: NextRequest, { params }: Ctx) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const limite = limitar(request, `nota:${sessao.parceiroId}`, 20, 60 * 60_000);
  if (limite) return limite;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return erro("não encontrado", 404);
  const form = await request.formData().catch(() => null);
  const r = await lerUpload(form?.get("nota"));
  if (!r.ok) return erro(r.erro);

  const [c] = await db
    .update(parceiroComissoes)
    .set({
      notaFiscal: r.bytes,
      notaFiscalNome: r.nome,
      notaFiscalMime: r.mime,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(parceiroComissoes.id, id),
        eq(parceiroComissoes.parceiroId, sessao.parceiroId),
        ne(parceiroComissoes.status, "cancelada"),
      ),
    )
    .returning({ id: parceiroComissoes.id });
  if (!c) return erro("não encontrado", 404);

  await db.insert(parceiroInteracoes).values({
    parceiroId: sessao.parceiroId,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: "Parceiro enviou nota fiscal de uma comissão.",
    metadata: { kind: "nota_fiscal_enviada", comissaoId: id },
  });
  return NextResponse.json({ ok: true });
}
