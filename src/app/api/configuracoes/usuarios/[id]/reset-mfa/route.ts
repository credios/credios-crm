import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { after, NextResponse, type NextRequest } from "next/server";

import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;

  const supabaseAdmin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: factors, error: listErr } = await supabaseAdmin.auth.admin.mfa.listFactors({
    userId: id,
  });
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  let removed = 0;
  for (const f of factors?.factors ?? []) {
    const { error: delErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
      userId: id,
      id: f.id,
    });
    if (!delErr) removed++;
  }

  after(() =>
    logAction(
    null,
    user.id,
    "usuario_mfa_reset",
    "usuario",
    id,
    { factoresRemovidos: removed },
    extractRequestMeta(request),
  )
  );

  return NextResponse.json({ ok: true, removed });
}
