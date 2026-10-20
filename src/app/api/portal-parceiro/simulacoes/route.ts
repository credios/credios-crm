import { NextResponse, type NextRequest } from "next/server";

import { precisaAssinarContrato } from "@/lib/portal-parceiro/contrato/servico";
import { erro, lerJson, limitar, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";
import { criarSimulacao, podeSimularCondominio } from "@/lib/portal-parceiro/simulacoes";
import { simulacaoCondominioSchema } from "@/lib/validators/simulacao-condominio";

// POST /api/portal-parceiro/simulacoes — o parceiro habilitado em condomínio
// gera uma simulação. Taxas vêm da config do admin; o corpo só traz o
// condomínio e o valor. O parceiro_id vem SEMPRE da sessão.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  if (!podeSimularCondominio(sessao)) {
    return erro("Simulação disponível para parceiros habilitados em crédito para condomínio.", 403);
  }
  if (await precisaAssinarContrato(sessao.parceiroId, sessao.produtosHabilitados)) {
    return erro("Assine o contrato de parceria antes de simular.", 403);
  }
  const limite = limitar(request, `simulacoes:${sessao.parceiroId}`, 60, 60 * 60_000);
  if (limite) return limite;

  const parsed = simulacaoCondominioSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path.join(".") || "form";
      if (!campos[k]) campos[k] = i.message;
    }
    return erro("Confira os campos destacados.", 400, { campos });
  }

  const r = await criarSimulacao(sessao, parsed.data);
  if (!r.ok) return erro(r.erro, 422, r.campos ? { campos: r.campos } : undefined);
  return NextResponse.json({ data: { id: r.id, codigo: r.codigo } }, { status: 201 });
}
