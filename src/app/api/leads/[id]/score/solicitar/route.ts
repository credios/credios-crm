import { and, eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  interacoes,
  leads as leadsTable,
  scoreSolicitacoes,
  users as usersTable,
} from "../../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { sendScoreSolicitacaoEmail } from "@/lib/notifications/email";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/[id]/score/solicitar — consultor pede a consulta de score
 * (paga, só admin executa). Cria a solicitação pendente, registra na timeline
 * e avisa os admins por e-mail. Aprovação: Mesa do admin ou card do lead.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil === "marketing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.read", { type: "lead", consultorId: lead.consultorId })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!lead.cpf || lead.cpf.replace(/\D/g, "").length !== 11) {
    return NextResponse.json(
      { error: "Lead sem CPF válido — preencha o CPF antes de solicitar." },
      { status: 400 },
    );
  }

  // Uma pendente por lead — evita fila duplicada.
  const [jaPendente] = await db
    .select({ id: scoreSolicitacoes.id })
    .from(scoreSolicitacoes)
    .where(
      and(eq(scoreSolicitacoes.leadId, id), eq(scoreSolicitacoes.status, "pendente")),
    )
    .limit(1);
  if (jaPendente) {
    return NextResponse.json(
      { error: "Já existe uma solicitação pendente pra este lead." },
      { status: 409 },
    );
  }

  const [sol] = await db
    .insert(scoreSolicitacoes)
    .values({ leadId: id, solicitadoPor: user.id })
    .returning({ id: scoreSolicitacoes.id });

  await db.insert(interacoes).values({
    leadId: id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo: `Consulta de score solicitada por ${user.nome} — aguardando aprovação do admin.`,
    metadata: { kind: "score_solicitado", solicitacaoId: sol!.id } as never,
  });

  // Aviso imediato pros admins ativos (best-effort).
  after(async () => {
    const admins = await db
      .select({ nome: usersTable.nome, email: usersTable.email })
      .from(usersTable)
      .where(and(eq(usersTable.perfil, "admin"), eq(usersTable.ativo, true)));
    for (const a of admins) {
      await sendScoreSolicitacaoEmail({
        to: a.email,
        adminNome: a.nome,
        solicitanteNome: user.nome,
        lead,
      }).catch((e) => console.error("[score/solicitar] email falhou:", e));
    }
  });

  const meta = extractRequestMeta(request);
  after(() =>
    logAction(null, user.id, "score_solicitado", "lead", id, { solicitacaoId: sol!.id }, meta),
  );

  return NextResponse.json({ data: { id: sol!.id } });
}
