import crypto from "node:crypto";

// ============================================================================
// PII hashing helpers
// ============================================================================
// Meta CAPI, TikTok Events API, LinkedIn Conversions API e similar todos
// exigem PII (email/phone) hasheado em SHA-256 lowercase trimmed.
// ============================================================================

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Email normalizado (lowercase + trim) → SHA-256 hex. */
export function hashEmail(email: string | null): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return sha256Hex(normalized);
}

/** Phone normalizado (apenas dígitos, sem +) → SHA-256 hex. */
export function hashPhone(phone: string | null): string | null {
  if (!phone) return null;
  const normalized = phone.replace(/\D/g, "");
  if (!normalized) return null;
  return sha256Hex(normalized);
}

/** Name normalizado (lowercase + trim) → SHA-256 hex. */
export function hashName(name: string | null): string | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  return sha256Hex(normalized);
}
