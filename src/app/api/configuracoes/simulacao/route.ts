import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { simulacaoConfig } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";
import {
  getSimulacaoConfig,
  SIMULACAO_CONFIG_CACHE_TAG,
} from "@/lib/simulador/config";
import { saneSimulacaoConfig } from "@/lib/simulador/faixa-config";

// Config da proposta em faixa — admin edita em /configuracoes/simulacao.

const faixaSchema = z
  .object({
    taxaMinAm: z.number().positive().max(10),
    taxaMaxAm: z.number().positive().max(10),
  })
  .refine((f) => f.taxaMaxAm >= f.taxaMinAm, {
    message: "Taxa máxima deve ser ≥ taxa mínima",
  });

const configSchema = z.object({
  pos: faixaSchema,
  pre: faixaSchema,
  prazos: z.array(z.number().int().min(12).max(420)).min(1).max(8),
  prazoDestaque: z.number().int(),
  comprometimentoRendaPct: z.number().min(10).max(100),
  validadeDias: z.number().int().min(1).max(180),
});

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ data: await getSimulacaoConfig() });
}

export async function PUT(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "validation failed" },
      { status: 400 },
    );
  }
  if (!parsed.data.prazos.includes(parsed.data.prazoDestaque)) {
    return NextResponse.json(
      { error: "O prazo destaque precisa estar entre os prazos exibidos." },
      { status: 400 },
    );
  }

  const config = saneSimulacaoConfig(parsed.data);
  const [existing] = await db.select({ id: simulacaoConfig.id }).from(simulacaoConfig).limit(1);
  if (existing) {
    await db
      .update(simulacaoConfig)
      .set({ config: config as never, updatedAt: new Date() })
      .where(eq(simulacaoConfig.id, existing.id));
  } else {
    await db.insert(simulacaoConfig).values({ config: config as never });
  }
  revalidateTag(SIMULACAO_CONFIG_CACHE_TAG, "max");

  after(() =>
    logAction(
      null,
      user.id,
      "simulacao_config_editada",
      "configuracao",
      null,
      { config },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ data: config });
}
