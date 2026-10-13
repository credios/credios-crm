import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { solicitarResetSenha } from "@/lib/portal-parceiro/conta";
import { erro, lerJson, limitar, origemInvalida } from "@/lib/portal-parceiro/http";

const schema = z.object({ email: z.string().trim().email().max(200) });

// POST /api/portal-parceiro/recuperar — resposta SEMPRE igual: não revela se
// o e-mail tem conta. O envio roda depois da resposta pra o tempo também não
// denunciar.
export async function POST(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const limite = limitar(request, "recuperar", 5, 60 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (parsed.success) {
    const { email } = parsed.data;
    after(() =>
      solicitarResetSenha(email).catch((e) =>
        console.error("[portal-parceiro] reset falhou:", e),
      ),
    );
  }
  return NextResponse.json({ ok: true });
}
