import { NextResponse } from "next/server";

import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { listarTodasAsComissoes } from "@/lib/parceiros/comissoes";
import { COMISSAO_STATUS_LABEL, type ComissaoStatus } from "@/lib/parceiros/constants";

// GET — exporta as comissões em CSV (admin). Separador ";" e BOM: abre certo
// no Excel em português.
export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const linhas = await listarTodasAsComissoes();
  const reais = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
  // Célula começando com = + - @ vira fórmula no Excel: neutraliza.
  const cel = (v: string | null | undefined) => {
    const s = (v ?? "").replace(/"/g, '""');
    return `"${/^[=+\-@]/.test(s) ? `'${s}` : s}"`;
  };
  const csv = [
    ["Parceiro", "Operação", "Produto", "Base (R$)", "Percentual (%)", "Comissão (R$)", "Status", "Vencimento", "Pago em", "Chave PIX"].join(";"),
    ...linhas.map((l) =>
      [
        cel(l.parceiroNome),
        cel(l.leadNome ?? l.descricao),
        cel(l.produto),
        reais(l.baseCentavos),
        l.percentualBps == null ? "" : (l.percentualBps / 100).toFixed(2).replace(".", ","),
        reais(l.valorCentavos),
        cel(COMISSAO_STATUS_LABEL[l.status as ComissaoStatus] ?? l.status),
        l.vencimento ?? "",
        l.pagoEm ?? "",
        cel(l.pixChave),
      ].join(";"),
    ),
  ].join("\r\n");

  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="comissoes-parceiros-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
