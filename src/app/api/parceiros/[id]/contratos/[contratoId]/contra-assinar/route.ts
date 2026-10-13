import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { contraAssinar } from "@/lib/portal-parceiro/contrato/servico";

type Ctx = { params: Promise<{ id: string; contratoId: string }> };

const schema = z.object({ aceito: z.literal(true) });

// POST — contra-assinatura da Credios no contrato de parceria. Admin only
// (o admin entra com 2FA obrigatório; o middleware barra sessão sem aal2).
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Confirme que leu e concorda com o contrato." },
      { status: 400 },
    );
  }

  const { id, contratoId } = await params;
  const meta = extractRequestMeta(request);
  const r = await contraAssinar(
    contratoId,
    { id: user.id, nome: user.nome, email: user.email },
    meta,
  );
  void logAction(null, user.id, "parceiro_contrato_contra_assinado", "parceiro", id,
    { contratoId, ok: r.ok }, meta);

  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
