import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { leads as leadsTable } from "../../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { sendPortalEmail } from "@/lib/portal/email";
import { generatePortalToken, portalUrl } from "@/lib/portal/token";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Gera um link do portal de documentos para o lead. Com `{ enviarEmail: true }`,
 * também dispara o e-mail personalizado pro cliente.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !checkPermission(user, "lead.update", {
      type: "lead",
      consultorId: lead.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    enviarEmail?: boolean;
  };

  const { token, expiresAt } = await generatePortalToken(lead.id, user.id);
  const url = portalUrl(token);

  let emailSent = false;
  let emailError: string | undefined;
  if (body.enviarEmail) {
    if (!lead.email) {
      emailError = "Lead sem e-mail cadastrado.";
    } else {
      const r = await sendPortalEmail({ nome: lead.nome, email: lead.email, url });
      emailSent = r.ok;
      if (!r.ok) emailError = r.reason;
    }
  }

  await logAction(
    null,
    user.id,
    body.enviarEmail ? "portal_link_enviado_email" : "portal_link_gerado",
    "lead",
    lead.id,
    { emailSent },
    extractRequestMeta(request),
  );

  return NextResponse.json({ url, expiresAt, emailSent, emailError });
}
