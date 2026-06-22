import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { buildLeadZip } from "@/lib/portal/documentos-pdf";

type Ctx = { params: Promise<{ id: string }> };

/** Baixa TODOS os documentos do lead num .zip — um PDF nomeado por tipo. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const [lead] = await db
    .select({ consultorId: leadsTable.consultorId })
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!checkPermission(user, "lead.read", { type: "lead", consultorId: lead.consultorId })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const zip = await buildLeadZip(id);
  if (!zip) return NextResponse.json({ error: "sem arquivos" }, { status: 404 });

  await logAction(
    null,
    user.id,
    "documento_baixado",
    "lead",
    id,
    { formato: "zip" },
    extractRequestMeta(request),
  );

  return new NextResponse(zip.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.filename}"`,
    },
  });
}
