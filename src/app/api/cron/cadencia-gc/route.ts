import { and, eq, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { interacoes, leads as leadsTable, users as usersTable } from "../../../../../db/schema";
import { listCadencias } from "@/lib/cadencia/config";
import { encerrarCadencia } from "@/lib/cadencia/engine";
import { db } from "@/lib/db";
import { onLeadStageChange } from "@/lib/google-ads/dispatcher";
import { sendAutoPerdidoEmail } from "@/lib/notifications/email";
import { notifyPartnerPortal } from "@/lib/notifications/portal-webhook";
import { resolveSlaAlertsForLead } from "@/lib/sla/check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Coletor de lixo da cadência (diário): lead cuja DECISÃO de fim de cadência
// ficou ignorada por 7+ dias → vira PERDIDO automaticamente ("sem resposta —
// cadência esgotada"), com e-mail imediato pro consultor (reversível a 1
// clique). Garante matematicamente que leads esquecidos não voltam a existir.

const DIAS_IGNORADO = 7;
const LOTE = 25;
const MOTIVO = "Sem resposta — cadência esgotada (auto)";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const cadencias = await listCadencias();
  const candidatos = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        isNotNull(leadsTable.cadenciaPasso),
        lt(leadsTable.cadenciaProximaEm, sql`now() - interval '${sql.raw(String(DIAS_IGNORADO))} days'`),
        notInArray(leadsTable.status, ["fechado", "perdido", "desqualificado"]),
      ),
    )
    .limit(LOTE);

  let encerrados = 0;
  for (const lead of candidatos) {
    // Só coleta quem parou no passo de DECISÃO (o resto é atraso de execução —
    // aparece na Mesa como atrasado, mas não é encerrado à revelia).
    const cad = cadencias.find((c) => c.statusKey === lead.status && c.ativa);
    const passo = cad?.passos[lead.cadenciaPasso ?? -1];
    if (!passo || passo.tipo !== "decisao") continue;

    const diasIgnorado = lead.cadenciaProximaEm
      ? Math.round((Date.now() - lead.cadenciaProximaEm.getTime()) / 86_400_000)
      : DIAS_IGNORADO;

    const [updated] = await db
      .update(leadsTable)
      .set({
        status: "perdido",
        motivoDesqualificacao: MOTIVO,
        bancoAprovador: null,
        valorLiberadoCentavos: null,
        comissaoCentavos: null,
        dataFechamento: null,
      })
      .where(eq(leadsTable.id, lead.id))
      .returning();
    await db.insert(interacoes).values({
      leadId: lead.id,
      autorId: null,
      tipo: "mudanca_status",
      conteudo: `Status alterado de ${lead.status} para perdido (automático — decisão de fim de cadência ignorada há ${diasIgnorado}d)`,
      metadata: {
        de: lead.status,
        para: "perdido",
        motivo: MOTIVO,
        auto_perdido: true,
      } as never,
    });
    await encerrarCadencia(lead.id);
    await resolveSlaAlertsForLead(lead.id);
    encerrados++;

    if (updated) {
      await notifyPartnerPortal(updated, "perdido").catch(() => {});
      await onLeadStageChange(updated, "perdido").catch(() => {});
    }

    // E-mail IMEDIATO pro consultor (pedido do owner — cobre falha humana).
    if (lead.consultorId && updated) {
      const [c] = await db
        .select({ email: usersTable.email, nome: usersTable.nome })
        .from(usersTable)
        .where(eq(usersTable.id, lead.consultorId))
        .limit(1);
      if (c?.email) {
        await sendAutoPerdidoEmail({
          to: c.email,
          consultorNome: c.nome,
          lead: updated,
          diasIgnorado,
        }).catch((e) => console.error("[cadencia-gc] email falhou:", e));
      }
    }
  }

  console.log(`[cron cadencia-gc] candidatos=${candidatos.length} encerrados=${encerrados}`);
  return NextResponse.json({ ok: true, candidatos: candidatos.length, encerrados });
}
