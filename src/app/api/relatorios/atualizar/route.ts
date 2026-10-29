import { revalidateTag } from "next/cache";
import { after, NextResponse, type NextRequest } from "next/server";

import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { RELATORIOS_CACHE_TAG } from "@/lib/reports/atualizacao";

/**
 * POST /api/relatorios/atualizar — botão "Atualizar dados" de /relatorios.
 * Fora dele, os números só se renovam às 9h e às 18h (lib/reports/atualizacao.ts).
 * `expire: 0` expira na hora: a próxima leitura recalcula em vez de servir o
 * valor antigo enquanto revalida.
 */
export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Mesmo gate da página: consultor não acessa /relatorios.
  if (user.perfil === "consultor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  revalidateTag(RELATORIOS_CACHE_TAG, { expire: 0 });

  after(() =>
    logAction(null, user.id, "relatorios_atualizados", "relatorio", null, {}, extractRequestMeta(request)),
  );
  return NextResponse.json({ ok: true });
}
