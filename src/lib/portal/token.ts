import crypto from "node:crypto";

import { eq } from "drizzle-orm";

import { leadPortalTokens } from "../../../db/schema";
import { db } from "@/lib/db";

const TOKEN_BYTES = 32; // 256 bits de entropia
const DEFAULT_TTL_DAYS = 30;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Gera um token de portal para um lead. Retorna o valor CRU (vai SÓ na URL) —
 * no banco guardamos apenas o hash sha256. Validade longa (30d) porque o cliente
 * pode enviar os documentos aos poucos. O token anterior (se houver) continua
 * válido até expirar ou ser revogado.
 */
export async function generatePortalToken(
  leadId: string,
  createdBy: string | null = null,
  ttlDays: number = DEFAULT_TTL_DAYS,
): Promise<{ token: string; expiresAt: Date }> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await db.insert(leadPortalTokens).values({
    leadId,
    tokenHash: hashToken(raw),
    expiresAt,
    createdBy,
  });
  return { token: raw, expiresAt };
}

/**
 * Valida um token cru: existe, não revogado, não expirado. Retorna o leadId ou
 * null. Marca last_used_at em best-effort (não bloqueia).
 */
export async function resolvePortalToken(raw: string): Promise<string | null> {
  if (!raw || raw.length < 16) return null;
  const tokenHash = hashToken(raw);
  const [row] = await db
    .select()
    .from(leadPortalTokens)
    .where(eq(leadPortalTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.revogadoEm) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  void db
    .update(leadPortalTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(leadPortalTokens.id, row.id))
    .catch(() => {
      /* best-effort */
    });

  return row.leadId;
}

/** Monta a URL pública do portal a partir do token cru. */
export function portalUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}/portal/${token}`;
}
