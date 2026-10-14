import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { assinarComoParceiro } from "@/lib/portal-parceiro/contrato/servico";
import { erro, lerJson, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

const schema = z.object({ contratoId: z.uuid(), aceito: z.literal(true) });

// POST /api/portal-parceiro/contrato/assinar — assinatura do parceiro. Exige
// o código conferido há no máximo 15 min, o aceite explícito e o ID do
// contrato exibido (se o texto mudou no meio, a assinatura é recusada).
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Confirme que leu e concorda com o contrato.");
  const r = await assinarComoParceiro(
    {
      parceiroId: sessao.parceiroId,
      usuarioId: sessao.usuarioId,
      nome: sessao.nome,
      email: sessao.email,
    },
    parsed.data.contratoId,
    metaDoRequest(request),
  );
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
