import { asc, eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  interacoes,
  leads as leadsTable,
  users as usersTable,
} from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { maskLeadForPerfil } from "@/lib/auth/mascaramento";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { formatProperName } from "@/lib/formatters/proper-name";
import { updateLeadSchema } from "@/lib/validators/lead";
import { normalizarCpf, normalizarWhatsapp } from "@/lib/validators/webhook";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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

  // Marketing NÃO recebe timeline (texto livre pode conter PII).
  // Bloqueio app-layer porque Drizzle bypassa RLS.
  const isMarketing = user.perfil === "marketing";
  const timeline = isMarketing
    ? []
    : await db
        .select({
          id: interacoes.id,
          leadId: interacoes.leadId,
          autorId: interacoes.autorId,
          tipo: interacoes.tipo,
          conteudo: interacoes.conteudo,
          metadata: interacoes.metadata,
          criadoEm: interacoes.criadoEm,
          autorNome: usersTable.nome,
        })
        .from(interacoes)
        .leftJoin(usersTable, eq(usersTable.id, interacoes.autorId))
        .where(eq(interacoes.leadId, id))
        .orderBy(asc(interacoes.criadoEm));

  // Não-crítico (alta frequência): após resposta.
  after(() =>
    logAction(
      null,
      user.id,
      "lead_visualizado",
      "lead",
      id,
      null,
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({
    data: maskLeadForPerfil(lead, user.perfil),
    interacoes: timeline,
    timelineRedacted: isMarketing,
  });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.update", {
      type: "lead",
      consultorId: existing.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = updateLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  // BUG histórico (corrigido em 2026-05-06): usávamos `"chave" in patch` pra
  // decidir o que atualizar, mas `patch` é o resultado do `updateLeadSchema`
  // (= `createLeadSchema.partial()`). O createLeadSchema tem dois booby traps
  // pra updates parciais:
  //   1. `optionalString` é `z.string().nullish().transform(v => v ?? null)`.
  //      O nullish() aceita undefined e o transform RODA, então campos não
  //      enviados saem do parse como `null`.
  //   2. `origem: optionalString.default("Manual")` — sempre vira "Manual"
  //      quando o cliente não envia `origem`.
  // Resultado: editar Contato (whatsapp/email/cidade/estado) limpava CPF,
  // estado civil, ocupação etc. e mudava origem pra "Manual".
  // Fix: usar o corpo bruto da requisição pra detectar O QUE foi enviado e
  // o `patch` (validado/normalizado) só pra valores. Validação Zod continua
  // ativa pra rejeitar tipos errados.
  const rawBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const updates: Record<string, unknown> = {};
  // Title Case PT-BR — uniformiza com webhook + criação manual.
  if ("nome" in rawBody && patch.nome != null)
    updates.nome = formatProperName(patch.nome);
  if ("cpf" in rawBody) updates.cpf = patch.cpf ? normalizarCpf(patch.cpf) : null;
  if ("estadoCivil" in rawBody) updates.estadoCivil = patch.estadoCivil ?? null;
  if ("ocupacao" in rawBody) updates.ocupacao = patch.ocupacao ?? null;
  if ("rendaMensalCentavos" in rawBody)
    updates.rendaMensalCentavos = patch.rendaMensalCentavos ?? null;
  if ("whatsapp" in rawBody && patch.whatsapp)
    updates.whatsapp = normalizarWhatsapp(patch.whatsapp);
  if ("email" in rawBody) updates.email = patch.email ?? null;
  if ("cidade" in rawBody) updates.cidade = patch.cidade ?? null;
  if ("estado" in rawBody) updates.estado = patch.estado?.toUpperCase() ?? null;
  if ("objetivoCredito" in rawBody)
    updates.objetivoCredito = patch.objetivoCredito ?? null;
  if ("tipoImovel" in rawBody) updates.tipoImovel = patch.tipoImovel ?? null;
  if ("tipoImovelDetalhes" in rawBody)
    updates.tipoImovelDetalhes = patch.tipoImovelDetalhes ?? null;
  if ("situacaoImovel" in rawBody)
    updates.situacaoImovel = patch.situacaoImovel ?? null;
  if ("tipoPessoa" in rawBody) updates.tipoPessoa = patch.tipoPessoa ?? null;
  if ("valorImovelCentavos" in rawBody)
    updates.valorImovelCentavos = patch.valorImovelCentavos ?? null;
  if ("saldoDevedorCentavos" in rawBody)
    updates.saldoDevedorCentavos = patch.saldoDevedorCentavos ?? null;
  if ("valorCreditoCentavos" in rawBody)
    updates.valorCreditoCentavos = patch.valorCreditoCentavos ?? null;
  if ("origem" in rawBody) updates.origem = patch.origem ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(leadsTable)
    .set(updates)
    .where(eq(leadsTable.id, id))
    .returning();

  // Não-crítico: edit comum vai pra after().
  after(() =>
    logAction(
      null,
      user.id,
      "lead_editado",
      "lead",
      id,
      { fields: Object.keys(updates) },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ data: updated });
}

/**
 * DELETE — exclusão hard de lead. Admin only.
 *
 * Operação destrutiva: remove o lead e via ON DELETE CASCADE também:
 *  - interações (timeline)
 *  - tarefas
 *  - duplicidades_pendentes (ambas as pontas)
 *  - sla_alertas
 *  - lead_bancos
 *
 * webhook_idempotency.lead_id vira NULL (mantém o registro pra dedupe).
 *
 * Audit log é GRAVADO ANTES do delete (await, não after()) — depois do delete
 * o ID some, e a auditoria precisa do registro mesmo se o request crashar
 * entre o delete e o logAction async.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!checkPermission(user, "lead.delete")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [existing] = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      status: leadsTable.status,
      consultorId: leadsTable.consultorId,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Audit antes do delete: precisamos do snapshot e o ID precisa existir
  // pra outras queries de auditoria conseguirem reconstruir o que aconteceu.
  await logAction(
    null,
    user.id,
    "lead_excluido",
    "lead",
    id,
    {
      nome: existing.nome,
      status: existing.status,
      consultorId: existing.consultorId,
    },
    extractRequestMeta(request),
  );

  await db.delete(leadsTable).where(eq(leadsTable.id, id));

  return NextResponse.json({ ok: true });
}
