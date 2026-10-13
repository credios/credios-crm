import { after, NextResponse, type NextRequest } from "next/server";

import { erro, lerJson, limitar, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";
import { criarIndicacao, notificarIndicacao } from "@/lib/portal-parceiro/indicacoes";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";
import { indicacaoSchema } from "@/lib/validators/indicacao";

// POST /api/portal-parceiro/clientes — o parceiro indica um cliente. O
// parceiro_id vem SEMPRE da sessão, nunca do corpo.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const limite = limitar(request, `clientes:${sessao.parceiroId}`, 30, 60 * 60_000);
  if (limite) return limite;

  const parsed = indicacaoSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = i.path.join(".") || "form";
      if (!campos[k]) campos[k] = i.message;
    }
    return erro("Confira os campos destacados.", 400, { campos });
  }

  const r = await criarIndicacao(sessao, parsed.data);
  if (r.ok) {
    const meta = metaDoRequest(request);
    after(() =>
      notificarIndicacao(r.leadId, sessao, meta).catch((e) =>
        console.error("[portal-parceiro] notificação da indicação falhou:", e),
      ),
    );
    return NextResponse.json({ data: { id: r.leadId } }, { status: 201 });
  }
  if ("duplicadaPropria" in r) {
    return NextResponse.json(
      { error: "Você já indicou este cliente.", duplicada: r.duplicadaPropria },
      { status: 409 },
    );
  }
  return erro(r.erro, 422, r.campos ? { campos: r.campos } : undefined);
}
