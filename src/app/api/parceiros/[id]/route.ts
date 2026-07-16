import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  parceiroInteracoes,
  parceiros,
  users as usersTable,
} from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser, type AppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  PARCEIRO_MOTIVOS_PERDA,
  PARCEIRO_SEGMENTOS,
  PARCEIRO_STATUS,
  PARCEIRO_STATUS_LABEL,
  type ParceiroStatus,
} from "@/lib/parceiros/constants";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/parceiros/[id] — edição de dados, transição de status e
// atribuição (triagem). Regras:
//   - marketing: bloqueado
//   - consultor: só os SEUS parceiros; não reatribui
//   - atribuição (consultorId): só admin/gerente — triagem é do admin
//   - status perdido exige motivo; ativo/convidado_portal têm timestamps

const patchSchema = z.object({
  nome: z.string().min(2).max(160).optional(),
  empresa: z.string().max(160).optional().nullable(),
  email: z.string().email().max(160).optional().nullable(),
  whatsapp: z.string().max(32).optional().nullable(),
  segmento: z.enum(PARCEIRO_SEGMENTOS).optional().nullable(),
  cidade: z.string().max(120).optional().nullable(),
  estado: z.string().length(2).optional().nullable(),
  cpfCnpj: z.string().max(20).optional().nullable(),
  notas: z.string().max(4000).optional().nullable(),
  status: z.enum(PARCEIRO_STATUS).optional(),
  motivoPerda: z.enum(PARCEIRO_MOTIVOS_PERDA).optional().nullable(),
  motivoPerdaDetalhe: z.string().max(400).optional().nullable(),
  consultorId: z.string().uuid().optional().nullable(),
});

async function loadParceiro(id: string) {
  const [p] = await db
    .select()
    .from(parceiros)
    .where(eq(parceiros.id, id))
    .limit(1);
  return p ?? null;
}

function podeVer(user: AppUser, p: { consultorId: string | null }): boolean {
  if (user.perfil === "marketing") return false;
  if (isAdminOrGerente(user)) return true;
  return p.consultorId === user.id;
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parceiro = await loadParceiro(id);
  if (!parceiro || !podeVer(user, parceiro)) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "dados inválidos" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const set: Record<string, unknown> = {};
  const eventos: Array<typeof parceiroInteracoes.$inferInsert> = [];

  // ── Campos simples ──
  if (data.nome !== undefined) set.nome = data.nome.trim();
  if (data.empresa !== undefined) set.empresa = data.empresa?.trim() ?? null;
  if (data.email !== undefined) set.email = data.email?.trim().toLowerCase() ?? null;
  if (data.whatsapp !== undefined) {
    const d = (data.whatsapp ?? "").replace(/\D/g, "");
    set.whatsapp = d.length >= 10 ? (d.startsWith("55") ? `+${d}` : `+55${d}`) : null;
  }
  if (data.segmento !== undefined) set.segmento = data.segmento;
  if (data.cidade !== undefined) set.cidade = data.cidade?.trim() ?? null;
  if (data.estado !== undefined) set.estado = data.estado?.toUpperCase() ?? null;
  if (data.cpfCnpj !== undefined) set.cpfCnpj = data.cpfCnpj?.replace(/\D/g, "") || null;
  if (data.notas !== undefined) set.notas = data.notas?.trim() ?? null;

  // ── Transição de status ──
  if (data.status && data.status !== parceiro.status) {
    if (data.status === "perdido" && !data.motivoPerda) {
      return NextResponse.json(
        { error: "informe o motivo da perda" },
        { status: 400 },
      );
    }
    set.status = data.status;
    if (data.status === "perdido") {
      const detalhe = data.motivoPerdaDetalhe?.trim();
      set.motivoPerda = detalhe
        ? `${data.motivoPerda}: ${detalhe}`
        : data.motivoPerda;
    }
    if (data.status === "ativo") set.ativoEm = new Date();
    eventos.push({
      parceiroId: id,
      autorId: user.id,
      tipo: "mudanca_status",
      conteudo: `Status: ${PARCEIRO_STATUS_LABEL[parceiro.status as ParceiroStatus] ?? parceiro.status} → ${PARCEIRO_STATUS_LABEL[data.status]}.`,
      metadata: {
        de: parceiro.status,
        para: data.status,
        ...(data.status === "perdido" ? { motivo: set.motivoPerda } : {}),
      },
    });
  }

  // ── Atribuição (triagem) ──
  if (data.consultorId !== undefined && data.consultorId !== parceiro.consultorId) {
    if (!isAdminOrGerente(user)) {
      return NextResponse.json(
        { error: "apenas admin/gerente atribuem parceiros" },
        { status: 403 },
      );
    }
    set.consultorId = data.consultorId;
    set.atribuidoEm = data.consultorId ? new Date() : null;
    let nomeNovo = "pool de triagem";
    if (data.consultorId) {
      const [u] = await db
        .select({ nome: usersTable.nome })
        .from(usersTable)
        .where(eq(usersTable.id, data.consultorId))
        .limit(1);
      nomeNovo = u?.nome ?? "consultor";
    }
    eventos.push({
      parceiroId: id,
      autorId: user.id,
      tipo: "mudanca_atribuicao",
      conteudo: `Atribuído a ${nomeNovo} por ${user.nome}.`,
      metadata: { de: parceiro.consultorId, para: data.consultorId },
    });
  }

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ ok: true, semMudanca: true });
  }
  set.updatedAt = new Date();
  await db.update(parceiros).set(set).where(eq(parceiros.id, id));
  if (eventos.length > 0) await db.insert(parceiroInteracoes).values(eventos);

  const meta = extractRequestMeta(request);
  void logAction(null, user.id, "parceiro_editado", "parceiro", id, {
    campos: Object.keys(set),
  }, meta);

  return NextResponse.json({ ok: true });
}
