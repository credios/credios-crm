import { createHash, randomBytes } from "node:crypto";

// Tokens de uso único (convite, redefinição) e de sessão: o valor em claro vai
// pro e-mail/cookie; no banco fica só o SHA-256. Vazou o banco, não vazou acesso.

export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
