import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { aceitarConvite } from "@/lib/portal-parceiro/conta";
import { erro, lerJson, limitar, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";

const schema = z.object({
  token: z.string().min(20).max(200),
  senha: z.string().min(1).max(200),
  aceitouTermos: z.literal(true),
});

// POST /api/portal-parceiro/convite — parceiro cria a senha a partir do
// convite enviado pelo admin. O token é de uso único.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const limite = limitar(request, "convite", 10, 15 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro("Crie uma senha e aceite os termos para continuar.");
  }
  const r = await aceitarConvite(parsed.data.token, parsed.data.senha, metaDoRequest(request));
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
