import { after, NextResponse, type NextRequest } from "next/server";

import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { consultarScoreLead } from "@/lib/score/directd";

type Ctx = { params: Promise<{ id: string }> };

// Consulta MANUAL de score (Direct Data — paga por hit): só admin. A UI mostra
// o botão travado pros demais perfis; aqui é a barreira real.

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") {
    return NextResponse.json(
      { error: "Somente admin pode requisitar consulta de score." },
      { status: 403 },
    );
  }

  const { id } = await params;
  // Manual sempre consulta de verdade (forcar) — a confirmação de custo/dedup
  // acontece no dialog da UI, com a idade da última consulta à vista.
  const resultado = await consultarScoreLead(id, {
    autorId: user.id,
    forcar: true,
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }

  const meta = extractRequestMeta(request);
  after(() =>
    logAction(null, user.id, "score_consultado", "lead", id, {
      consultaScoreId: resultado.consulta.id,
      score: resultado.consulta.score,
    }, meta),
  );

  return NextResponse.json({ data: resultado.consulta });
}
