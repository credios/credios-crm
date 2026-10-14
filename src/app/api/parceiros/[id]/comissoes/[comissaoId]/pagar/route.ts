import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { parceiroComissoes } from "../../../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { lerUpload } from "@/lib/parceiros/comissoes";

type Ctx = { params: Promise<{ id: string; comissaoId: string }> };

// POST (multipart) — admin marca a comissão como paga: data obrigatória,
// comprovante opcional (PDF/PNG/JPG até 5 MB). O parceiro vê o comprovante
// no portal.
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, comissaoId } = await params;
  const form = await request.formData().catch(() => null);
  const pagoEm = String(form?.get("pagoEm") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pagoEm)) {
    return NextResponse.json({ error: "Informe a data do pagamento." }, { status: 400 });
  }

  const arquivo = form?.get("comprovante");
  let comprovante: { bytes: Buffer; mime: string; nome: string } | null = null;
  if (arquivo instanceof File && arquivo.size > 0) {
    const r = await lerUpload(arquivo);
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    comprovante = r;
  }

  const [c] = await db
    .update(parceiroComissoes)
    .set({
      status: "paga",
      pagoEm,
      ...(comprovante
        ? {
            comprovante: comprovante.bytes,
            comprovanteNome: comprovante.nome,
            comprovanteMime: comprovante.mime,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(parceiroComissoes.id, comissaoId), eq(parceiroComissoes.parceiroId, id)))
    .returning({ id: parceiroComissoes.id, status: parceiroComissoes.status });
  if (!c) return NextResponse.json({ error: "não encontrado" }, { status: 404 });

  void logAction(null, user.id, "parceiro_comissao_paga", "parceiro", id,
    { comissaoId, pagoEm, comprovante: !!comprovante }, extractRequestMeta(request));
  return NextResponse.json({ ok: true });
}
