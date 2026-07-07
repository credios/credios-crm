import crypto from "node:crypto";

import { and, eq, gte, sql } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";

import {
  interacoes,
  leadDocumentos,
  leads as leadsTable,
  users as usersTable,
} from "../../../../../../db/schema";
import { db } from "@/lib/db";
import { sendDocsIniciadosEmail } from "@/lib/notifications/email";
import { resolvePortalToken } from "@/lib/portal/token";
import { createAdminClient, DOCUMENTOS_BUCKET } from "@/lib/supabase/admin";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
]);
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  pdf: "application/pdf",
};

function fileExt(filename: string): string {
  return filename.includes(".")
    ? filename.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

/**
 * Resolve o MIME efetivo. Celulares (sobretudo iPhone com HEIC) às vezes mandam
 * `file.type` vazio ou genérico — caímos na extensão para não rejeitar foto
 * válida. Retorna null se não for um formato aceito.
 */
function resolveMime(file: File): string | null {
  if (ALLOWED_MIME.has(file.type)) return file.type;
  const m = MIME_BY_EXT[fileExt(file.name)];
  return m && ALLOWED_MIME.has(m) ? m : null;
}

function safeExt(filename: string, mime: string): string {
  const fromName = fileExt(filename);
  if (fromName && fromName.length <= 5) return fromName;
  return EXT_BY_MIME[mime] ?? "bin";
}

type Ctx = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const leadId = await resolvePortalToken(token);
  if (!leadId) {
    return NextResponse.json(
      { error: "link inválido ou expirado" },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "envio inválido" }, { status: 400 });
  }

  const file = form.get("file");
  const tipo = String(form.get("tipo") ?? "").trim();
  const categoria = String(form.get("categoria") ?? "").trim();
  const rotulo = String(form.get("rotulo") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  }
  if (!tipo || !categoria || !rotulo) {
    return NextResponse.json(
      { error: "metadados do documento ausentes" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "arquivo vazio" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "arquivo muito grande (máx. 25 MB)" },
      { status: 413 },
    );
  }
  const mime = resolveMime(file);
  if (!mime) {
    return NextResponse.json(
      { error: "formato não aceito (use PDF, JPG, PNG ou HEIC)" },
      { status: 415 },
    );
  }

  const ext = safeExt(file.name, mime);
  const storagePath = `${leadId}/${tipo}/${crypto.randomUUID()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const supabase = createAdminClient();
  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTOS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mime,
      upsert: false,
    });

  if (uploadError) {
    console.error("[portal/upload] storage error:", uploadError);
    return NextResponse.json(
      { error: "não foi possível salvar o arquivo agora" },
      { status: 500 },
    );
  }

  let docId: string;
  try {
    const [doc] = await db
      .insert(leadDocumentos)
      .values({
        leadId,
        tipo,
        categoria,
        rotulo,
        storagePath,
        filenameOriginal: file.name.slice(0, 300),
        mime,
        tamanhoBytes: file.size,
        origem: "portal",
      })
      .returning({ id: leadDocumentos.id });
    docId = doc!.id;

    // Detecta INÍCIO de envio (nenhum outro upload nas últimas 12h) ANTES de
    // registrar este — pra avisar o consultor só no 1º arquivo do lote, não a
    // cada foto que o cliente sobe em sequência.
    const [uploadRecente] = await db
      .select({ id: interacoes.id })
      .from(interacoes)
      .where(
        and(
          eq(interacoes.leadId, leadId),
          eq(interacoes.tipo, "documento_recebido"),
          // Upload nas últimas 12h = mesmo lote (não reavisa a cada arquivo).
          gte(interacoes.criadoEm, sql`now() - interval '12 hours'`),
        ),
      )
      .limit(1);
    const inicioDeEnvio = !uploadRecente;

    await db.insert(interacoes).values({
      leadId,
      autorId: null,
      tipo: "documento_recebido",
      conteudo: `Documento recebido pelo portal: ${rotulo} (${file.name})`,
      metadata: { tipo, categoria, storagePath } as never,
    });

    if (inicioDeEnvio) {
      after(async () => {
        const [lead] = await db
          .select()
          .from(leadsTable)
          .where(eq(leadsTable.id, leadId))
          .limit(1);
        if (!lead?.consultorId) return;
        const [c] = await db
          .select({ nome: usersTable.nome, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, lead.consultorId))
          .limit(1);
        if (!c?.email) return;
        await sendDocsIniciadosEmail({
          to: c.email,
          consultorNome: c.nome,
          lead,
          rotuloDocumento: rotulo,
        }).catch((e) => console.error("[portal/upload] email docs falhou:", e));
      });
    }
  } catch (err) {
    // Falhou o metadado: remove o arquivo órfão pra não deixar lixo no bucket.
    await supabase.storage.from(DOCUMENTOS_BUCKET).remove([storagePath]).catch(() => {});
    console.error("[portal/upload] db error:", err);
    return NextResponse.json(
      { error: "não foi possível registrar o documento" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    documento: {
      id: docId,
      tipo,
      rotulo,
      filename: file.name,
      tamanhoBytes: file.size,
    },
  });
}

/** Remove um documento que o próprio cliente enviou por engano (?docId=...). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const leadId = await resolvePortalToken(token);
  if (!leadId) {
    return NextResponse.json(
      { error: "link inválido ou expirado" },
      { status: 401 },
    );
  }

  const docId = request.nextUrl.searchParams.get("docId");
  if (!docId) {
    return NextResponse.json({ error: "docId ausente" }, { status: 400 });
  }

  // Só permite remover documento que pertence a ESTE lead (defesa via token).
  const [doc] = await db
    .select({ id: leadDocumentos.id, storagePath: leadDocumentos.storagePath })
    .from(leadDocumentos)
    .where(and(eq(leadDocumentos.id, docId), eq(leadDocumentos.leadId, leadId)))
    .limit(1);
  if (!doc) {
    return NextResponse.json({ error: "documento não encontrado" }, { status: 404 });
  }

  const supabase = createAdminClient();
  await supabase.storage.from(DOCUMENTOS_BUCKET).remove([doc.storagePath]).catch(() => {});
  await db.delete(leadDocumentos).where(eq(leadDocumentos.id, doc.id));

  return NextResponse.json({ ok: true });
}
