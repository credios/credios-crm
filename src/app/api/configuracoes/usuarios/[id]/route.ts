import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  leads as leadsTable,
  users as usersTable,
} from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { updateUserSchema } from "@/lib/validators/user";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;

  // Auto-proteção: admin não pode rebaixar/desativar a si mesmo (evita lockout).
  if (id === user.id) {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      body = {};
    }
    const b = body as { perfil?: string; ativo?: boolean };
    if (b.perfil && b.perfil !== "admin") {
      return NextResponse.json(
        { error: "Não pode mudar próprio perfil — peça pra outro admin" },
        { status: 400 },
      );
    }
    if (b.ativo === false) {
      return NextResponse.json(
        { error: "Não pode desativar a si mesmo" },
        { status: 400 },
      );
    }
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const updates: Record<string, unknown> = {};
  if (data.nome != null) updates.nome = data.nome;
  if (data.perfil != null) updates.perfil = data.perfil;
  if (data.ativo != null) updates.ativo = data.ativo;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  after(() =>
    logAction(
    null,
    user.id,
    "usuario_editado",
    "usuario",
    id,
    { fields: Object.keys(updates), antes: { nome: existing.nome, perfil: existing.perfil, ativo: existing.ativo }, depois: updates },
    extractRequestMeta(request),
  )
  );

  return NextResponse.json({ data: updated });
}

// ============================================================================
// DELETE — exclui usuário (irreversível)
// ============================================================================
//
// Comportamento:
//  - Bloqueia self-delete (admin não exclui a si mesmo).
//  - FKs em leads/interacoes/audit/sla estão como ON DELETE SET NULL → leads
//    atribuídos voltam pro pool (consultor_id=null), histórico de audit e
//    interações fica preservado mas sem autor.
//  - Deleta primeiro de public.users (FK SET NULL cuida) depois de auth.users
//    via service-role pra liberar o email.
//  - Audit logado ANTES da exclusão pra não perder o registro de quem fez.
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;

  if (id === user.id) {
    return NextResponse.json(
      { error: "Não pode excluir a si mesmo." },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existing)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  // Conta leads que ficarão "no pool" depois do delete — informativo no audit.
  const [leadsCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.consultorId, id),
        inArray(leadsTable.status, [
          "novo",
          "conversa_inicial",
          "aguardando_resposta",
          "aguardando_documentacao",
          "documentacao_enviada",
          "em_negociacao",
        ]),
      ),
    );
  const leadsAtribuidosAtivos = leadsCountRow?.count ?? 0;

  // Audit ANTES da exclusão.
  await logAction(
    null,
    user.id,
    "usuario_excluido",
    "usuario",
    id,
    {
      antes: {
        nome: existing.nome,
        email: existing.email,
        perfil: existing.perfil,
        ativo: existing.ativo,
      },
      leads_atribuidos_ativos_que_voltaram_ao_pool: leadsAtribuidosAtivos,
    },
    extractRequestMeta(request),
  );

  // Delete de public.users — FKs SET NULL nos leads/interacoes/audit/sla.
  await db.delete(usersTable).where(eq(usersTable.id, id));

  // Delete de auth.users via service-role pra liberar email pra reuso.
  // Falha silenciosa: se auth.users já não existir (raro) ou key inválida,
  // o user já saiu de public.users — admin pode investigar via Supabase
  // dashboard. Não desfazemos a exclusão de public.
  try {
    const admin = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    await admin.auth.admin.deleteUser(id);
  } catch (err) {
    // Log mas não falha a request — a exclusão de public.users já efetivou
    // a perda de acesso ao app (sem registro em public.users → getAppUser() = null).
    console.error("[users.DELETE] Falha ao excluir auth.users:", err);
  }

  return NextResponse.json({
    ok: true,
    leadsAtribuidosAtivos,
  });
}
