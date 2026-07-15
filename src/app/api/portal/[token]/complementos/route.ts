import { and, eq, gt, sql } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { interacoes, leads } from "../../../../../../db/schema";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolvePortalToken } from "@/lib/portal/token";

type Ctx = { params: Promise<{ token: string }> };

// Complementos do portal VIP: o cliente preenche os dados que faltam pro
// cadastro no banco parceiro (valor do imóvel, valor do crédito, contato do
// cônjuge) e cada campo é salvo NO CRM assim que ele sai do campo (autosave
// incremental — nada de "salvar tudo no fim" que se perde se ele fechar).
//
// PATCH parcial: manda só o que mudou. Cada chamada atualiza o lead e a
// timeline recebe UM resumo consolidado (throttle de 10 min) — sem poluir
// com uma linha por tecla.

const bodySchema = z.object({
  /** Reais (não centavos) — o client manda o número limpo. */
  valorImovel: z.number().positive().max(500_000_000).optional(),
  valorCredito: z.number().positive().max(100_000_000).optional(),
  conjugeEmail: z.string().email().max(160).optional(),
  conjugeWhatsapp: z.string().min(8).max(32).optional(),
  conjugeNome: z.string().min(2).max(160).optional(),
  /** Vocabulário do CRM: "Casado(a)", "Solteiro(a)"… (ESTADO_CIVIL_VIP_CRM). */
  estadoCivil: z
    .enum(["Solteiro(a)", "Casado(a)", "União Estável", "Divorciado(a)", "Viúvo(a)"])
    .optional(),
});

const LABEL: Record<string, string> = {
  valorImovel: "valor do imóvel",
  valorCredito: "valor do crédito",
  conjugeEmail: "e-mail do cônjuge",
  conjugeWhatsapp: "WhatsApp do cônjuge",
  conjugeNome: "nome do cônjuge",
  estadoCivil: "estado civil",
};

/** E.164 pro padrão do CRM (+55DDDNÚMERO). */
function normalizaWhatsapp(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length < 10) return null;
  if (d.startsWith("55")) return `+${d}`;
  return `+55${d}`;
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { token } = await params;
  // Autosave dispara com frequência — limite generoso, só anti-abuso.
  if (!rateLimit(`portal-complementos:${clientIp(request.headers)}`, 120, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const leadId = await resolvePortalToken(token);
  if (!leadId) {
    return NextResponse.json({ error: "link inválido ou expirado" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "envio inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "dados inválidos" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const set: Record<string, unknown> = {};
  const alterados: string[] = [];
  if (data.valorImovel != null) {
    set.valorImovelCentavos = Math.round(data.valorImovel * 100);
    alterados.push(LABEL.valorImovel!);
  }
  if (data.valorCredito != null) {
    set.valorCreditoCentavos = Math.round(data.valorCredito * 100);
    alterados.push(LABEL.valorCredito!);
  }
  if (data.conjugeEmail != null) {
    set.conjugeEmail = data.conjugeEmail.trim().toLowerCase();
    alterados.push(LABEL.conjugeEmail!);
  }
  if (data.conjugeWhatsapp != null) {
    const e164 = normalizaWhatsapp(data.conjugeWhatsapp);
    if (!e164) {
      return NextResponse.json({ error: "WhatsApp inválido" }, { status: 400 });
    }
    set.conjugeWhatsapp = e164;
    alterados.push(LABEL.conjugeWhatsapp!);
  }
  if (data.conjugeNome != null) {
    set.conjugeNome = data.conjugeNome.trim();
    alterados.push(LABEL.conjugeNome!);
  }
  if (data.estadoCivil != null) {
    set.estadoCivil = data.estadoCivil;
    alterados.push(LABEL.estadoCivil!);
  }

  // Drizzle lança em set({}) vazio — nada mudou, responde ok.
  if (Object.keys(set).length === 0) {
    return NextResponse.json({ ok: true, semMudanca: true });
  }
  set.updatedAt = new Date();
  await db.update(leads).set(set).where(eq(leads.id, leadId));

  // Timeline: 1 linha consolidada a cada 10 min (não uma por campo).
  after(async () => {
    try {
      const [ja] = await db
        .select({ id: interacoes.id })
        .from(interacoes)
        .where(
          and(
            eq(interacoes.leadId, leadId),
            sql`${interacoes.metadata}->>'kind' = 'portal_complementos'`,
            gt(interacoes.criadoEm, new Date(Date.now() - 10 * 60_000)),
          ),
        )
        .limit(1);
      if (ja) return;
      await db.insert(interacoes).values({
        leadId,
        autorId: null,
        tipo: "evento_sistema",
        conteudo: `Cliente completou dados no portal: ${alterados.join(", ")}.`,
        metadata: { kind: "portal_complementos", campos: alterados } as never,
      });
    } catch (e) {
      console.error("[portal/complementos] timeline falhou:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
