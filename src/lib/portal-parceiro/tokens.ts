import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Tokens de uso único (convite, redefinição) e de sessão: o valor em claro vai
// pro e-mail/cookie; no banco fica só o SHA-256. Vazou o banco, não vazou acesso.

export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Código curto público de verificação de contrato, ex.: CRD-7K2M-9XQ4. */
export function gerarCodigoVerificacao(): string {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I/L
  const pick = (n: number) =>
    Array.from({ length: n }, () => alfabeto[randomInt(alfabeto.length)]).join("");
  return `CRD-${pick(4)}-${pick(4)}`;
}

/** OTP numérico de 6 dígitos para assinatura de contrato. */
export function gerarOtp(): { otp: string; hash: string } {
  const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return { otp, hash: hashToken(otp) };
}

export function hashIgual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
