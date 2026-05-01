import type { SupabaseClient } from "@supabase/supabase-js";

import { auditLog } from "../../db/schema";
import { db } from "@/lib/db";

export type AuditParams = {
  acao: string;
  usuarioId?: string | null;
  recursoTipo?: string | null;
  recursoId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Insere um evento em audit_log via Drizzle (postgres user → bypassa RLS).
 * Nunca lança — apenas loga em console se falhar.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      usuarioId: params.usuarioId ?? null,
      acao: params.acao,
      recursoTipo: params.recursoTipo ?? null,
      recursoId: params.recursoId ?? null,
      metadata: (params.metadata ?? null) as never,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    });
  } catch (err) {
    console.error("[audit] falha ao registrar evento:", err, params);
  }
}

/**
 * Variante posicional pedida no §6 das tarefas. O parâmetro `_supabase` é
 * aceito para sinalizar contexto autenticado mas NÃO é usado internamente:
 * audit_log não tem policy de INSERT, portanto usar Supabase JS com a sessão
 * do usuário daria 403. Usamos Drizzle (postgres user, BYPASSRLS).
 */
export async function logAction(
  _supabase: SupabaseClient | null,
  userId: string | null,
  action: string,
  resourceType?: string | null,
  resourceId?: string | null,
  metadata?: Record<string, unknown> | null,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  await logAudit({
    usuarioId: userId,
    acao: action,
    recursoTipo: resourceType ?? null,
    recursoId: resourceId ?? null,
    metadata: metadata ?? null,
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  });
}

export function extractRequestMeta(request: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? (fwd.split(",")[0]?.trim() ?? null) : request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");
  return { ip: ip ?? null, userAgent: userAgent ?? null };
}
