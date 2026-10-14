import { NextResponse, type NextRequest } from "next/server";

import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { cancelarContrato } from "@/lib/portal-parceiro/contrato/servico";

type Ctx = { params: Promise<{ id: string; contratoId: string }> };

// POST — admin cancela um contrato ainda não concluído (dado errado no
// cadastro, por exemplo). O parceiro volta a precisar assinar.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, contratoId } = await params;
  const meta = extractRequestMeta(request);
  const r = await cancelarContrato(id, contratoId, { id: user.id, nome: user.nome }, meta);
  void logAction(null, user.id, "parceiro_contrato_cancelado", "parceiro", id,
    { contratoId, ok: r.ok }, meta);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
