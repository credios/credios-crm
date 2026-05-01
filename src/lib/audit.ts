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
    // Audit nunca deve quebrar o fluxo principal — apenas logar.
    console.error("[audit] falha ao registrar evento:", err, params);
  }
}

export function extractRequestMeta(request: Request): { ip: string | null; userAgent: string | null } {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]?.trim() ?? null : request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");
  return { ip: ip ?? null, userAgent: userAgent ?? null };
}
