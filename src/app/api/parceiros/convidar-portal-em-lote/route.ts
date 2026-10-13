import { NextResponse, type NextRequest } from "next/server";

import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { convidarEmLote } from "@/lib/portal-parceiro/lote";

export const maxDuration = 60;

// POST /api/parceiros/convidar-portal-em-lote — convida pro portal todos os
// parceiros com contrato assinado e sem login (os migrados do portal antigo).
// Admin only. Dispara e-mail pra cada um.
export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const r = await convidarEmLote(user.id);
  void logAction(null, user.id, "parceiro_portal_convite_em_lote", "parceiro", null,
    { total: r.total, enviados: r.enviados, falhas: r.falhas.length },
    extractRequestMeta(request));
  return NextResponse.json({ data: r });
}
