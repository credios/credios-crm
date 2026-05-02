"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import { emailPasswordSchema } from "@/lib/validators/auth";

export type LoginState = {
  error?: string;
};

/**
 * Server action de login email/senha.
 *
 * Diferente do client-side `supabase.auth.signInWithPassword`, este handler:
 *  - Roda no server e tem acesso ao session cookie escrito pelo Supabase SSR.
 *  - Registra um audit_log do login (LGPD).
 *  - Sanitiza `next` via safeNext() antes de redirecionar (evita open redirect).
 *
 * O fluxo OAuth (Google) continua client→callback porque não tem como entrar
 * server-side sem expor secret. O callback `/auth/callback` já valida o `next`
 * e loga o login server-side, então cobertura é igual.
 */
export async function loginWithPasswordAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = emailPasswordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Email ou senha inválidos." };
  }
  const rawNext = formData.get("next");
  const next = safeNext(typeof rawNext === "string" ? rawNext : null);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: error.message || "Falha no login." };
  }

  // Audit (await — login é evento crítico LGPD).
  if (data.user) {
    const h = await headers();
    await logAudit({
      usuarioId: data.user.id,
      acao: "login",
      recursoTipo: "sessao",
      recursoId: null,
      metadata: { metodo: "password" },
      ip: h.get("x-forwarded-for") ?? null,
      userAgent: h.get("user-agent") ?? null,
    });
  }

  redirect(next);
}
