import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { parceiroInteracoes, parceiros } from "../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  PARCEIRO_ORIGENS,
  PARCEIRO_SEGMENTOS,
} from "@/lib/parceiros/constants";

// POST /api/parceiros — criação manual (indicação, prospecção ativa, evento).
// Admin/gerente podem deixar no pool (triagem) ou atribuir; consultor cria
// já atribuído a si. Marketing não opera parceiros.

const createSchema = z.object({
  nome: z.string().min(2).max(160),
  empresa: z.string().max(160).optional().nullable(),
  email: z.string().email().max(160).optional().nullable(),
  whatsapp: z.string().min(8).max(32).optional().nullable(),
  segmento: z.enum(PARCEIRO_SEGMENTOS).optional().nullable(),
  cidade: z.string().max(120).optional().nullable(),
  estado: z.string().length(2).optional().nullable(),
  cpfCnpj: z.string().max(20).optional().nullable(),
  origem: z.enum(PARCEIRO_ORIGENS).default("prospeccao"),
  notas: z.string().max(4000).optional().nullable(),
  /** admin/gerente: null = pool de triagem; consultor: ignorado (vira ele). */
  consultorId: z.string().uuid().optional().nullable(),
});

function normalizaWhatsapp(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") ? `+${d}` : `+55${d}`;
}

export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.perfil === "marketing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "dados inválidos" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const consultorId = isAdminOrGerente(user)
    ? (data.consultorId ?? null)
    : user.id;

  const [criado] = await db
    .insert(parceiros)
    .values({
      nome: data.nome.trim(),
      empresa: data.empresa?.trim() ?? null,
      email: data.email?.trim().toLowerCase() ?? null,
      whatsapp: normalizaWhatsapp(data.whatsapp),
      segmento: data.segmento ?? null,
      cidade: data.cidade?.trim() ?? null,
      estado: data.estado?.toUpperCase() ?? null,
      cpfCnpj: data.cpfCnpj?.replace(/\D/g, "") || null,
      origem: data.origem,
      notas: data.notas?.trim() ?? null,
      consultorId,
      atribuidoEm: consultorId ? new Date() : null,
      createdBy: user.id,
    })
    .returning({ id: parceiros.id });

  const id = criado!.id;
  await db.insert(parceiroInteracoes).values({
    parceiroId: id,
    autorId: user.id,
    tipo: "evento_sistema",
    conteudo: `Parceiro cadastrado manualmente por ${user.nome}.`,
    metadata: { kind: "criacao_manual" },
  });

  const meta = extractRequestMeta(request);
  void logAction(null, user.id, "parceiro_criado", "parceiro", id, {}, meta);

  return NextResponse.json({ data: { id } }, { status: 201 });
}
