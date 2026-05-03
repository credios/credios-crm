/**
 * Sanitiza um valor de "next" / "redirectTo" recebido como query param ou
 * input do user. Bloqueia open redirects: aceita APENAS paths internos
 * começando com "/" e que NÃO sejam protocol-relative ("//foo") nem
 * absolutos ("http://", "https://", "javascript:") nem do Windows ("\\foo").
 *
 * Default fallback: "/leads".
 *
 * Casos rejeitados (todos viram fallback):
 *   - null, undefined, "" → fallback
 *   - "//evil.com" → protocol-relative, vai pra evil.com
 *   - "http://evil.com" → absoluto externo
 *   - "https://evil.com" → idem
 *   - "javascript:alert(1)" → XSS via href
 *   - "data:..." → idem
 *   - "\\evil.com" → backslash trick (browsers normalizam pra //)
 *   - "/login" via path com ":" suspeito → bloqueia
 *
 * Casos aceitos:
 *   - "/leads"
 *   - "/leads/abc-123"
 *   - "/relatorios?periodo=30d"
 */
export function safeNext(
  value: string | null | undefined,
  fallback: string = "/minha-mesa",
): string {
  if (!value || typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed === "") return fallback;

  // Bloqueio explícito de protocol-relative e schemes perigosos.
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.startsWith("\\")) return fallback;
  // Path tem que começar com "/".
  if (!trimmed.startsWith("/")) return fallback;

  // Defesa adicional: tentar resolver como URL contra origin "fake" — se a
  // URL resolver pra hostname diferente do esperado, é absoluto disfarçado.
  // Ex: "/foo\\@evil.com" pode ser interpretado como path mas URL parser
  // entende como evil.com.
  try {
    const u = new URL(trimmed, "https://app.local");
    if (u.origin !== "https://app.local") return fallback;
    // Reconstroi a partir do path + search + hash pra eliminar bytes maliciosos.
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
