import { asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

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

  const timeline = await db
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

  void logAction(
    null,
    user.id,
    "lead_visualizado",
    "lead",
    id,
    null,
    extractRequestMeta(request),
  );

  return NextResponse.json({
    data: maskLeadForPerfil(lead, user.perfil),
    interacoes: timeline,
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

  const updates: Record<string, unknown> = {};
  if (patch.nome != null) updates.nome = patch.nome;
  if ("cpf" in patch) updates.cpf = patch.cpf ? normalizarCpf(patch.cpf) : null;
  if ("estadoCivil" in patch) updates.estadoCivil = patch.estadoCivil ?? null;
  if ("ocupacao" in patch) updates.ocupacao = patch.ocupacao ?? null;
  if ("rendaMensalCentavos" in patch)
    updates.rendaMensalCentavos = patch.rendaMensalCentavos ?? null;
  if ("whatsapp" in patch && patch.whatsapp)
    updates.whatsapp = normalizarWhatsapp(patch.whatsapp);
  if ("email" in patch) updates.email = patch.email ?? null;
  if ("cidade" in patch) updates.cidade = patch.cidade ?? null;
  if ("estado" in patch) updates.estado = patch.estado?.toUpperCase() ?? null;
  if ("objetivoCredito" in patch)
    updates.objetivoCredito = patch.objetivoCredito ?? null;
  if ("tipoImovel" in patch) updates.tipoImovel = patch.tipoImovel ?? null;
  if ("situacaoImovel" in patch) updates.situacaoImovel = patch.situacaoImovel ?? null;
  if ("tipoPessoa" in patch) updates.tipoPessoa = patch.tipoPessoa ?? null;
  if ("valorImovelCentavos" in patch)
    updates.valorImovelCentavos = patch.valorImovelCentavos ?? null;
  if ("valorCreditoCentavos" in patch)
    updates.valorCreditoCentavos = patch.valorCreditoCentavos ?? null;
  if ("origem" in patch) updates.origem = patch.origem ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(leadsTable)
    .set(updates)
    .where(eq(leadsTable.id, id))
    .returning();

  void logAction(
    null,
    user.id,
    "lead_editado",
    "lead",
    id,
    { fields: Object.keys(updates) },
    extractRequestMeta(request),
  );

  return NextResponse.json({ data: updated });
}
