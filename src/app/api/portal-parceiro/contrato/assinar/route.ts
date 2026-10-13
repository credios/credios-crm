import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { assinarComoParceiro } from "@/lib/portal-parceiro/contrato/servico";
import { erro, lerJson, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

const schema = z.object({ aceito: z.literal(true) });

// POST /api/portal-parceiro/contrato/assinar — assinatura do parceiro. Exige
// o código já conferido e o aceite explícito do texto.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Confirme que leu e concorda com o contrato.");
  const r = await assinarComoParceiro(
    sessao.parceiroId,
    { nome: sessao.nome, email: sessao.email },
    metaDoRequest(request),
  );
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
