import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { parceiroInteracoes, parceiroUsuarios, parceiros } from "../../../../../db/schema";
import { db } from "@/lib/db";
import { erro, lerJson, limitar, origemInvalida } from "@/lib/portal-parceiro/http";
import { verificarSenha } from "@/lib/portal-parceiro/senha";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

const schema = z.object({
  pixChave: z.string().trim().min(3).max(160),
  senhaAtual: z.string().min(1).max(200),
});

// PATCH /api/portal-parceiro/perfil — o parceiro atualiza a própria chave PIX.
// É pra onde a comissão é paga, então exige a senha de novo (sessão roubada
// não redireciona pagamento) e fica registrado na ficha pro admin ver.
export async function PATCH(request: NextRequest) {
  if (origemInvalida(request)) return erro("forbidden", 403);
  const sessao = await getParceiroSessao();
  if (!sessao) return erro("unauthorized", 401);
  const limite = limitar(request, "perfil", 10, 15 * 60_000);
  if (limite) return limite;

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Informe a chave PIX e a sua senha.");

  const [u] = await db
    .select({ senhaHash: parceiroUsuarios.senhaHash })
    .from(parceiroUsuarios)
    .where(eq(parceiroUsuarios.id, sessao.usuarioId))
    .limit(1);
  if (!u || !(await verificarSenha(parsed.data.senhaAtual, u.senhaHash))) {
    return erro("Senha incorreta.");
  }

  await db
    .update(parceiros)
    .set({ pixChave: parsed.data.pixChave, updatedAt: new Date() })
    .where(eq(parceiros.id, sessao.parceiroId));
  await db.insert(parceiroInteracoes).values({
    parceiroId: sessao.parceiroId,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: "Parceiro alterou a chave PIX pelo portal. Confirme com ele antes do próximo pagamento.",
    metadata: { kind: "pix_alterado_pelo_parceiro" },
  });
  return NextResponse.json({ ok: true });
}
