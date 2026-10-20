import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { simulacaoCondominioConfig } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { db } from "@/lib/db";
import {
  MAX_PRAZOS,
  PRAZO_MAX_MESES,
  PRAZO_MIN_MESES,
  saneSimulacaoCondominioConfig,
  TAXA_MAX_AM,
} from "@/lib/simulador/condominio-config";
import {
  getSimulacaoCondominioConfig,
  SIMULACAO_CONDOMINIO_CACHE_TAG,
} from "@/lib/simulador/config";

// Config da simulação de crédito para condomínio (portal do parceiro) —
// admin edita em /configuracoes/simulacao-condominio.

const configSchema = z
  .object({
    prazos: z
      .array(
        z.object({
          meses: z
            .number()
            .int("Prazo precisa ser um número inteiro de meses.")
            .min(PRAZO_MIN_MESES, `Prazo mínimo: ${PRAZO_MIN_MESES} mês.`)
            .max(PRAZO_MAX_MESES, `Prazo máximo: ${PRAZO_MAX_MESES} meses.`),
          taxaAm: z
            .number()
            .positive("Taxa precisa ser maior que zero.")
            .max(TAXA_MAX_AM, `Taxa máxima: ${TAXA_MAX_AM}% a.m.`),
        }),
      )
      .min(1, "Cadastre ao menos um prazo.")
      .max(MAX_PRAZOS, `No máximo ${MAX_PRAZOS} prazos.`)
      .refine((p) => new Set(p.map((x) => x.meses)).size === p.length, {
        message: "Há prazos repetidos.",
      }),
    validadeDias: z.number().int().min(1, "Validade mínima: 1 dia.").max(180, "Validade máxima: 180 dias."),
    iofAdicionalPct: z.number().min(0).max(5, "IOF adicional acima de 5%? Confira."),
    iofDiarioPct: z.number().min(0).max(0.1, "IOF diário acima de 0,1%? Confira."),
    valorMinimo: z.number().min(1_000, "Valor mínimo: R$ 1.000."),
    valorMaximo: z.number().positive(),
  })
  .refine((c) => c.valorMaximo > c.valorMinimo, {
    message: "O valor máximo precisa ser maior que o mínimo.",
  });

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ data: await getSimulacaoCondominioConfig() });
}

export async function PUT(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

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

  const antes = await getSimulacaoCondominioConfig();
  const config = saneSimulacaoCondominioConfig(parsed.data);
  const [existing] = await db
    .select({ id: simulacaoCondominioConfig.id })
    .from(simulacaoCondominioConfig)
    .limit(1);
  if (existing) {
    await db
      .update(simulacaoCondominioConfig)
      .set({ config: config as never, updatedAt: new Date(), updatedBy: user.id })
      .where(eq(simulacaoCondominioConfig.id, existing.id));
  } else {
    await db.insert(simulacaoCondominioConfig).values({ config: config as never, updatedBy: user.id });
  }
  revalidateTag(SIMULACAO_CONDOMINIO_CACHE_TAG, "max");

  after(() =>
    logAction(
      null,
      user.id,
      "simulacao_condominio_config_editada",
      "configuracao",
      null,
      { antes, depois: config },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ data: config });
}
