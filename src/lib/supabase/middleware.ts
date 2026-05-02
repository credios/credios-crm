import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rotas que NÃO exigem autenticação Supabase. CADA uma deve ter seu próprio
// gate (secret header, IP allowlist, etc) dentro do handler.
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/recuperar-senha",
  "/auth/callback",
  "/auth/logout",
  "/desafio-mfa",
  "/api/webhooks", // gate: x-webhook-secret
  "/api/cron", // gate: Authorization: Bearer ${CRON_SECRET} (Vercel Cron)
];

// Rotas que, se acessadas por usuário já autenticado, devem ser redirecionadas para a app.
const AUTH_ONLY_PUBLIC_PREFIXES = ["/login", "/recuperar-senha"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function isAuthOnlyPublicPath(pathname: string): boolean {
  return AUTH_ONLY_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Webhooks/cron/callbacks têm seus próprios gates no handler. Evita uma ida
  // ao Supabase Auth em rotas que não precisam saber se existe sessão.
  if (isPublicPath(path) && !isAuthOnlyPublicPath(path)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: getClaims() é a única chamada entre createServerClient e a
  // decisão de roteamento. Ele valida o JWT localmente quando o projeto usa
  // signing keys assimétricas; com chaves simétricas, cai para getUser().
  // Inserir lógica entre eles pode silenciosamente deslogar usuários (ver docs do
  // @supabase/ssr).
  const { data: claimsData } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(claimsData?.claims?.sub);

  // Logado e tentando acessar /login ou /recuperar-senha → manda para a app.
  if (isAuthenticated && isAuthOnlyPublicPath(path)) {
    return NextResponse.redirect(new URL("/leads", request.url));
  }

  // Rotas públicas em geral: passa.
  if (isPublicPath(path)) {
    return supabaseResponse;
  }

  // Raiz: redireciona conforme estado de auth.
  if (path === "/") {
    return NextResponse.redirect(
      new URL(isAuthenticated ? "/leads" : "/login", request.url),
    );
  }

  // Demais rotas: exigem autenticação.
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    if (path !== "/") {
      loginUrl.searchParams.set("redirectTo", path + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
