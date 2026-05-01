import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { users as usersTable } from "../../../../../../db/schema";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { realRoutingDeps } from "@/lib/routing/db-deps";
import { aplicarRoteamento } from "@/lib/routing/engine";
import { testarRoteamentoSchema } from "@/lib/validators/rule";

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

  const parsed = testarRoteamentoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const ctx = parsed.data;

  const result = await aplicarRoteamento(
    {
      valorCreditoCentavos: ctx.valorCreditoCentavos ?? null,
      valorImovelCentavos: ctx.valorImovelCentavos ?? null,
      estado: ctx.estado ?? null,
      origem: ctx.origem ?? null,
      tipoImovel: ctx.tipoImovel ?? null,
      horarioComercial: ctx.horarioComercial,
    },
    realRoutingDeps,
    { dryRun: true },
  );

  let consultorNome: string | null = null;
  if (result.consultorId) {
    const [u] = await db
      .select({ nome: usersTable.nome })
      .from(usersTable)
      .where(eq(usersTable.id, result.consultorId))
      .limit(1);
    consultorNome = u?.nome ?? null;
  }

  return NextResponse.json({
    ...result,
    consultorNome,
  });
}
