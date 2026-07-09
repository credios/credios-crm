import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — confirma que os valores do lead estão CORRETOS (revisão do bloco de
 * qualidade de dados dos relatórios). Marca `valores_revisado_em` e o alerta
 * some das listagens; não altera nenhum valor (pra corrigir, edita-se o lead
 * — o alerta some sozinho quando o valor sai da faixa atípica).
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminOrGerente(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [lead] = await db
    .select({ id: leadsTable.id, valoresRevisadoEm: leadsTable.valoresRevisadoEm })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (lead.valoresRevisadoEm) {
    return NextResponse.json({ ok: true, jaRevisado: true });
  }

  await db
    .update(leadsTable)
    .set({
      valoresRevisadoEm: new Date(),
      valoresRevisadoPor: user.id,
      valoresRevisadoAcao: "mantido",
    })
    .where(eq(leadsTable.id, id));

  await db.insert(interacoes).values({
    leadId: id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo: `Valores do lead confirmados como corretos por ${user.nome} (revisão de qualidade dos relatórios).`,
    metadata: { kind: "valores_confirmados", via: "relatorios" } as never,
  });

  const meta = extractRequestMeta(request);
  after(() =>
    logAction(null, user.id, "valores_confirmados", "lead", id, { via: "relatorios" }, meta),
  );

  return NextResponse.json({ ok: true });
}
