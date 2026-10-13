import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { trocarSenha } from "@/lib/portal-parceiro/conta";
import { erro, lerJson, limitar, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

const schema = z.object({
  senhaAtual: z.string().min(1).max(200),
  novaSenha: z.string().min(1).max(200),
});

// POST /api/portal-parceiro/senha — troca de senha pelo parceiro logado.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const limite = limitar(request, "senha", 10, 15 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Informe a senha atual e a nova.");
  const r = await trocarSenha(
    sessao.usuarioId,
    parsed.data.senhaAtual,
    parsed.data.novaSenha,
    metaDoRequest(request),
  );
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
