import { NextResponse, type NextRequest } from "next/server";

import { extractRequestMeta, logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const meta = extractRequestMeta(request);
    void logAudit({
      usuarioId: user.id,
      acao: "logout",
      recursoTipo: "sessao",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
