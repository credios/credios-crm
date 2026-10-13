import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { autenticar } from "@/lib/portal-parceiro/conta";
import { erro, lerJson, limitar, metaDoRequest, origemInvalida } from "@/lib/portal-parceiro/http";

const schema = z.object({
  email: z.string().trim().email().max(200),
  senha: z.string().min(1).max(200),
});

// POST /api/portal-parceiro/entrar — login do parceiro. Limite por IP aqui +
// bloqueio por conta (5 falhas → 15 min) dentro de `autenticar`.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const limite = limitar(request, "entrar", 20, 15 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Informe e-mail e senha.");

  const r = await autenticar(parsed.data.email, parsed.data.senha, metaDoRequest(request));
  if (!r.ok) return erro(r.erro, 401);
  return NextResponse.json({ ok: true });
}
