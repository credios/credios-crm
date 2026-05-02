import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { users as usersTable } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { inviteUserSchema } from "@/lib/validators/user";

type ListedUser = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  whatsapp: string | null;
  createdAt: Date;
  lastSignInAt: Date | null;
  hasMfa: boolean;
};

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await db.execute<ListedUser>(sql`
    SELECT
      u.id, u.nome, u.email, u.perfil, u.ativo, u.whatsapp, u.created_at AS "createdAt",
      a.last_sign_in_at AS "lastSignInAt",
      EXISTS(
        SELECT 1 FROM auth.mfa_factors
        WHERE user_id = u.id AND status = 'verified'
      ) AS "hasMfa"
    FROM public.users u
    LEFT JOIN auth.users a ON a.id = u.id
    ORDER BY u.ativo DESC, u.nome
  `);

  return NextResponse.json({ data: rows });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseAdmin(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { email, nome, perfil } = parsed.data;

  const supabaseAdmin = getSupabaseAdmin();

  // Verifica se email já existe (via Auth)
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) {
    return NextResponse.json(
      { error: `Já existe usuário com email ${email}` },
      { status: 409 },
    );
  }

  // Convida via Supabase (envia email com link de signup)
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/primeiro-acesso`;
  const { data, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: nome },
  });
  if (inviteErr || !data.user) {
    return NextResponse.json(
      { error: inviteErr?.message ?? "Falha ao convidar" },
      { status: 500 },
    );
  }

  // Trigger on_auth_user_created criou public.users com perfil='consultor'.
  // Atualiza pro perfil escolhido + nome.
  await db
    .update(usersTable)
    .set({ nome, perfil, ativo: true })
    .where(eq(usersTable.id, data.user.id));

  void logAction(
    null,
    user.id,
    "usuario_convidado",
    "usuario",
    data.user.id,
    { email, nome, perfil },
    extractRequestMeta(request),
  );

  return NextResponse.json(
    { data: { id: data.user.id, email, nome, perfil } },
    { status: 201 },
  );
}
