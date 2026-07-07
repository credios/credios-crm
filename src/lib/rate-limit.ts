// Rate limiting leve, em memória, por instância serverless (janela deslizante).
// Não é distribuído — cada instância da Vercel tem seu próprio contador — mas
// corta o grosso de flooding/abuso nos endpoints públicos sem dependência
// externa. Se um dia precisar de limite exato multi-instância: Upstash/Redis.

const buckets = new Map<string, number[]>();
const MAX_KEYS = 5_000; // backstop de memória

/** true = permitido; false = estourou o limite (caller responde 429). */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const agora = Date.now();
  const corte = agora - windowMs;
  let hits = buckets.get(key);
  if (!hits) {
    if (buckets.size >= MAX_KEYS) buckets.clear();
    hits = [];
    buckets.set(key, hits);
  }
  // remove hits fora da janela (in-place, array curto)
  while (hits.length > 0 && hits[0]! < corte) hits.shift();
  if (hits.length >= max) return false;
  hits.push(agora);
  return true;
}

/** IP do request atrás do proxy da Vercel. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
