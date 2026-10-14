import { NextResponse, type NextRequest } from "next/server";

import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { arquivoDaComissao, respostaDeArquivo } from "@/lib/parceiros/comissoes";

type Ctx = { params: Promise<{ id: string; comissaoId: string }> };

// GET ?tipo=comprovante|nota — admin baixa o arquivo da comissão.
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, comissaoId } = await params;
  const tipo = request.nextUrl.searchParams.get("tipo") === "nota" ? "nota" : "comprovante";
  const a = await arquivoDaComissao(comissaoId, tipo, id);
  if (!a) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  return respostaDeArquivo(a);
}
