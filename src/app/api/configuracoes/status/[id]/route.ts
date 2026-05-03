import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { after, NextResponse, type NextRequest } from "next/server";

import { statusLeadConfig } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { cascadeLeadsFromStatus } from "@/lib/status/cascade";
import { updateStatusSchema } from "@/lib/validators/status";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH — edita label, cor, ordem, eTerminal, ativo.
 * Sistema (`eSistema=true`) NÃO permite mudar key (já bloqueado pelo schema)
 * — só os campos editáveis acima.
 *
 * Quando `ativo` muda pra `false`, dispara cascade pra mover leads existentes
 * pro `cascadeTo` (ou anterior por ordem). Status sistema também respeita
 * isso — pode "esconder" um status do funil sem deletá-lo.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(statusLeadConfig)
    .where(eq(statusLeadConfig.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Detecta intenção de desativar pra rodar cascade ANTES do update final.
  const isDeactivating = data.ativo === false && existing.ativo === true;
  let cascadeResult: { target: string; movedCount: number } | null = null;

  if (isDeactivating) {
    if (data.cascadeTo === existing.key) {
      return NextResponse.json(
        { error: "cascadeTo não pode ser o próprio status" },
        { status: 400 },
      );
    }
    cascadeResult = await cascadeLeadsFromStatus(existing.key, data.cascadeTo ?? null);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.label !== undefined) updates.label = data.label;
  if (data.ativo !== undefined) updates.ativo = data.ativo;
  if (data.eTerminal !== undefined) updates.eTerminal = data.eTerminal;
  if (data.cor !== undefined) updates.cor = data.cor ?? null;
  if (data.ordem !== undefined) updates.ordem = data.ordem;

  const [updated] = await db
    .update(statusLeadConfig)
    .set(updates)
    .where(eq(statusLeadConfig.id, id))
    .returning();

  updateTag("status:config");
  after(() =>
    logAction(
      null,
      user.id,
      isDeactivating ? "status_desativado" : "status_editado",
      "status_lead_config",
      id,
      {
        key: existing.key,
        changes: Object.keys(updates).filter((k) => k !== "updatedAt"),
        cascade: cascadeResult,
      },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({
    data: updated,
    cascade: cascadeResult,
  });
}

/**
 * DELETE — exclusão permanente. Funciona para status sistema E custom.
 *
 * Para custom statuses: cascata simples (move leads pro alvo, deleta).
 *
 * Para SISTEMA: além da cascata, há código no app que checa keys específicas
 * pra modais especiais — `if (status === "fechado")` etc. Excluir esses
 * keys faz a UI continuar funcional pros leads existentes (que foram movidos
 * pelo cascade), mas:
 *  - Modal de fechamento não dispara mais (não há como mover pra "fechado")
 *  - Modal de desqualificação idem
 *  - Modal de bancos (documentacao_enviada/em_negociacao) idem
 *  - Permissão admin-only de fechar/reabrir vira inerte
 *
 * Cliente DEVE confirmar com warning forte antes — implementado na UI.
 *
 * `cascadeTo` pode vir como query param ?cascadeTo=outra_key.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(statusLeadConfig)
    .where(eq(statusLeadConfig.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Status sistema (`eSistema=true`) é referenciado em código pra modais e
  // permissões especiais (fechado, desqualificado, em_negociacao, etc).
  // Excluir torna esses fluxos inertes e quebra o app silenciosamente —
  // bloqueamos delete e instruímos a desativar (ativo=false) via PATCH.
  if (existing.eSistema) {
    return NextResponse.json(
      {
        error:
          "Status sistema não pode ser excluído. Use desativar (ativo=false) pra removê-lo do funil sem quebrar fluxos do app.",
      },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const cascadeToParam = url.searchParams.get("cascadeTo");

  if (cascadeToParam === existing.key) {
    return NextResponse.json(
      { error: "cascadeTo não pode ser o próprio status" },
      { status: 400 },
    );
  }

  const cascade = await cascadeLeadsFromStatus(
    existing.key,
    cascadeToParam ?? null,
  );

  await db.delete(statusLeadConfig).where(eq(statusLeadConfig.id, id));

  updateTag("status:config");
  after(() =>
    logAction(
      null,
      user.id,
      "status_excluido",
      "status_lead_config",
      id,
      {
        key: existing.key,
        label: existing.label,
        eSistema: existing.eSistema,
        cascade,
      },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ ok: true, cascade });
}
