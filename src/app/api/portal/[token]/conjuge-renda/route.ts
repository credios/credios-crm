import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { leads } from "../../../../../../db/schema";
import { db } from "@/lib/db";
import { resolvePortalToken } from "@/lib/portal/token";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Cliente respondeu no portal se o cônjuge vai compor renda (quando pulou a
 * última etapa do simulador). Atualiza o lead — a checklist é recalculada no
 * reload da página.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const leadId = await resolvePortalToken(token);
  if (!leadId) {
    return NextResponse.json({ error: "link inválido ou expirado" }, { status: 401 });
  }

  let body: { compoe?: boolean; renda?: number; ocupacao?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "envio inválido" }, { status: 400 });
  }

  const compoe = body.compoe === true;
  const rendaCentavos =
    compoe && typeof body.renda === "number" && body.renda >= 0
      ? Math.round(body.renda * 100)
      : null;
  const ocupacao =
    compoe && typeof body.ocupacao === "string"
      ? body.ocupacao.trim().slice(0, 60) || null
      : null;

  await db
    .update(leads)
    .set({
      conjugeCompoeRenda: compoe,
      conjugeRendaCentavos: rendaCentavos,
      conjugeOcupacao: ocupacao,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  return NextResponse.json({ ok: true });
}
