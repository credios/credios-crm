import { eq } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { interacoes, leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getSimulacaoConfig } from "@/lib/simulador/config";
import { generateSimulationId } from "@/lib/simulador/simulation-id";
import { LTV_MAX } from "@/lib/simulador/validator";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  creditAmount: z.number().positive(),
  propertyValue: z.number().positive(),
  indexation: z.enum(["pre", "pos"]),
});

/**
 * POST /api/leads/[id]/proposta — registra uma PROPOSTA EM FAIXA gerada
 * (1 clique no card do lead). As faixas de taxa vêm da config do admin;
 * aqui só validamos valores/LTV, geramos o nº e gravamos o evento na
 * timeline (1 clique = 1 evento; recarregar a aba do PDF não duplica).
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Marketing vê valores mascarados — proposta sairia com lixo.
  if (user.perfil === "marketing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [lead] = await db
    .select({ id: leadsTable.id, consultorId: leadsTable.consultorId })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.read", {
      type: "lead",
      consultorId: lead.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const ltv = data.creditAmount / data.propertyValue;
  if (ltv > LTV_MAX) {
    return NextResponse.json(
      { error: `LTV acima do máximo de ${LTV_MAX * 100}%` },
      { status: 400 },
    );
  }

  const config = await getSimulacaoConfig();
  const faixa = data.indexation === "pos" ? config.pos : config.pre;
  const simulationId = generateSimulationId();

  const valorFmt = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(data.creditAmount);
  const faixaFmt = `${faixa.taxaMinAm.toFixed(2).replace(".", ",")}–${faixa.taxaMaxAm.toFixed(2).replace(".", ",")}% a.m.${data.indexation === "pos" ? " + IPCA" : ""}`;

  await db.insert(interacoes).values({
    leadId: id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo: [
      `Proposta ${simulationId} gerada (faixa de taxas)`,
      `${valorFmt} · ${faixaFmt} · prazos até ${config.prazos[config.prazos.length - 1]} meses · Price/SAC`,
    ].join("\n"),
    metadata: {
      kind: "proposta_faixa_gerada",
      simulation_id: simulationId,
      credit_amount: data.creditAmount,
      property_value: data.propertyValue,
      ltv: Number((ltv * 100).toFixed(2)),
      indexation: data.indexation,
      taxa_min_am: faixa.taxaMinAm,
      taxa_max_am: faixa.taxaMaxAm,
      prazos: config.prazos,
    } as never,
  });

  after(() =>
    logAction(
      null,
      user.id,
      "proposta_gerada",
      "lead",
      id,
      {
        simulation_id: simulationId,
        credit_amount: data.creditAmount,
        indexation: data.indexation,
      },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ simulationId });
}
