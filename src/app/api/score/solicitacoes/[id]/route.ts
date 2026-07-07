import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import { interacoes, scoreSolicitacoes } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";
import { consultarScoreLead } from "@/lib/score/directd";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/score/solicitacoes/[id] — admin resolve a solicitação:
 * { acao: "aprovar" } → consulta o score na hora (com dedup de 30 dias — se
 * já existe consulta recente, reaproveita sem gastar hit) e marca aprovada;
 * { acao: "recusar" } → só marca recusada, com registro na timeline.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") {
    return NextResponse.json(
      { error: "Somente admin pode aprovar consultas de score." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const [sol] = await db
    .select()
    .from(scoreSolicitacoes)
    .where(eq(scoreSolicitacoes.id, id))
    .limit(1);
  if (!sol) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (sol.status !== "pendente") {
    return NextResponse.json({ error: "Solicitação já resolvida." }, { status: 409 });
  }

  let body: { acao?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const acao = body.acao;
  if (acao !== "aprovar" && acao !== "recusar") {
    return NextResponse.json({ error: "acao inválida" }, { status: 400 });
  }

  if (acao === "aprovar") {
    // Dedup ativo: consulta <30d do mesmo CPF é reaproveitada (sem custo novo).
    const resultado = await consultarScoreLead(sol.leadId, { autorId: user.id });
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.erro }, { status: 502 });
    }
    await db
      .update(scoreSolicitacoes)
      .set({ status: "aprovada", resolvidoPor: user.id, resolvidoEm: new Date() })
      .where(eq(scoreSolicitacoes.id, id));
    if (resultado.dedup) {
      await db.insert(interacoes).values({
        leadId: sol.leadId,
        autorId: user.id,
        tipo: "evento_sistema",
        conteudo: `Solicitação de score aprovada — reaproveitada consulta recente (score ${resultado.consulta.score ?? "—"}), sem custo novo.`,
        metadata: { kind: "score_solicitacao_resolvida", resolucao: "aprovada", dedup: true } as never,
      });
    }
    const meta = extractRequestMeta(request);
    after(() =>
      logAction(null, user.id, "score_solicitacao_aprovada", "lead", sol.leadId, {
        solicitacaoId: id,
        dedup: resultado.dedup,
      }, meta),
    );
    return NextResponse.json({ data: { resolucao: "aprovada", consulta: resultado.consulta } });
  }

  await db
    .update(scoreSolicitacoes)
    .set({ status: "recusada", resolvidoPor: user.id, resolvidoEm: new Date() })
    .where(eq(scoreSolicitacoes.id, id));
  await db.insert(interacoes).values({
    leadId: sol.leadId,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo: "Solicitação de consulta de score recusada pelo admin.",
    metadata: { kind: "score_solicitacao_resolvida", resolucao: "recusada" } as never,
  });
  const meta = extractRequestMeta(request);
  after(() =>
    logAction(null, user.id, "score_solicitacao_recusada", "lead", sol.leadId, {
      solicitacaoId: id,
    }, meta),
  );
  return NextResponse.json({ data: { resolucao: "recusada" } });
}
