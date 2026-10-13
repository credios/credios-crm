import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { convidarParceiro, definirAcessoPortal } from "@/lib/portal-parceiro/conta";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ acao: z.enum(["convidar", "suspender", "reativar"]) });

// POST /api/parceiros/[id]/acesso-portal — admin libera (convida/reenvia),
// suspende ou reativa o acesso do parceiro ao portal. Admin only.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ação inválida" }, { status: 400 });
  }
  const { acao } = parsed.data;

  const r =
    acao === "convidar"
      ? await convidarParceiro(id, user.id)
      : await definirAcessoPortal(id, acao, user.id);

  void logAction(null, user.id, `parceiro_portal_${acao}`, "parceiro", id, { ok: r.ok },
    extractRequestMeta(request));

  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
