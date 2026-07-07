import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { leadDocumentos, leads as leadsTable } from "../../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { createAdminClient, DOCUMENTOS_BUCKET } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string; docId: string }> };

/** Baixa um documento via URL assinada de curta duração. Acesso é auditado. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Documentos são PII pesada (RG, renda, matrícula) — marketing vê o lead
  // mascarado e NÃO pode baixar o dossiê (consistente com bancos/interações).
  if (user.perfil === "marketing") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id, docId } = await params;

  const [doc] = await db
    .select({
      id: leadDocumentos.id,
      storagePath: leadDocumentos.storagePath,
      filenameOriginal: leadDocumentos.filenameOriginal,
      consultorId: leadsTable.consultorId,
    })
    .from(leadDocumentos)
    .innerJoin(leadsTable, eq(leadsTable.id, leadDocumentos.leadId))
    .where(and(eq(leadDocumentos.id, docId), eq(leadDocumentos.leadId, id)))
    .limit(1);

  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.read", {
      type: "lead",
      consultorId: doc.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENTOS_BUCKET)
    .createSignedUrl(doc.storagePath, 60, {
      download: doc.filenameOriginal ?? true,
    });

  if (error || !data?.signedUrl) {
    console.error("[documentos/download] signed url error:", error);
    return NextResponse.json(
      { error: "não foi possível gerar o download" },
      { status: 500 },
    );
  }

  // LGPD: registra quem baixou qual documento e quando.
  await logAction(
    null,
    user.id,
    "documento_baixado",
    "lead",
    id,
    { docId },
    extractRequestMeta(request),
  );

  return NextResponse.redirect(data.signedUrl);
}
