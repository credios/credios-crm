import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { salvarRepresentante } from "@/lib/portal-parceiro/contrato/servico";
import { erro, lerJson, limitar, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

const schema = z.object({
  nome: z.string().trim().min(3).max(160),
  cpf: z.string().trim().min(11).max(20),
  declaroPoderes: z.literal(true),
});

// POST /api/portal-parceiro/contrato/representante — parceiro PJ informa quem
// assina pela empresa, declarando ter poderes. Só antes de assinar.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const limite = limitar(request, "contrato-representante", 10, 15 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro("Informe nome, CPF e confirme que você tem poderes para assinar pela empresa.");
  }
  const r = await salvarRepresentante(sessao.parceiroId, parsed.data.nome, parsed.data.cpf);
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
