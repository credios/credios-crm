import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Hash de senha do portal do parceiro: scrypt (nativo do Node, sem dependência).
// Formato: scrypt$N$r$p$<salt base64url>$<hash base64url>. Os parâmetros vão
// junto pra poderem subir depois sem invalidar as senhas antigas.

const N = 2 ** 15; // custo de CPU/memória (~32 MB por hash)
const R = 8;
const P = 1;
const KEYLEN = 64;

export const SENHA_MIN = 10;

function derivar(senha: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      senha.normalize("NFKC"),
      salt,
      KEYLEN,
      // maxmem acima do default (32 MB) — N=2^15, r=8 fica no limite dele.
      { N: n, r, p, maxmem: 128 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derivar(senha, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Comparação em tempo constante. Hash malformado ou ausente = false. */
export async function verificarSenha(senha: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  const partes = hash.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, salt, esperado] = partes as [string, string, string, string, string, string];
  const nn = Number(n);
  const rr = Number(r);
  const pp = Number(p);
  if (![nn, rr, pp].every((x) => Number.isInteger(x) && x > 0) || nn > 2 ** 20) return false;
  try {
    const key = await derivar(senha, Buffer.from(salt, "base64url"), nn, rr, pp);
    const alvo = Buffer.from(esperado, "base64url");
    return key.length === alvo.length && timingSafeEqual(key, alvo);
  } catch {
    return false;
  }
}

/** Mensagem de erro, ou null se a senha serve. */
export function validarSenha(senha: string): string | null {
  if (senha.length < SENHA_MIN) return `A senha precisa de pelo menos ${SENHA_MIN} caracteres.`;
  if (senha.length > 200) return "Senha longa demais.";
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) {
    return "Use letras e números na senha.";
  }
  return null;
}
