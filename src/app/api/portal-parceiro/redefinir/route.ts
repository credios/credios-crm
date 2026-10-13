import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { redefinirSenha } from "@/lib/portal-parceiro/conta";
import { erro, lerJson, limitar, origemInvalida } from "@/lib/portal-parceiro/http";

const schema = z.object({
  token: z.string().min(20).max(200),
  senha: z.string().min(1).max(200),
});

// POST /api/portal-parceiro/redefinir — define a nova senha com o token do e-mail.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const limite = limitar(request, "redefinir", 10, 15 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Informe a nova senha.");
  const r = await redefinirSenha(parsed.data.token, parsed.data.senha);
  if (!r.ok) return erro(r.erro);
  return NextResponse.json({ ok: true });
}
