import { NextResponse, type NextRequest } from "next/server";

import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { pdfDoContrato } from "@/lib/portal-parceiro/contrato/servico";

type Ctx = { params: Promise<{ id: string; contratoId: string }> };

// GET — admin baixa o contrato do parceiro (via final se concluído).
export async function GET(_request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, contratoId } = await params;
  const pdf = await pdfDoContrato(contratoId, id);
  if (!pdf) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdf.nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
