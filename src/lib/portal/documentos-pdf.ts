import "server-only";

import { and, asc, eq } from "drizzle-orm";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { leadDocumentos, leads } from "../../../db/schema";
import { db } from "@/lib/db";
import { createAdminClient, DOCUMENTOS_BUCKET } from "@/lib/supabase/admin";

/** Nome de arquivo seguro a partir de texto livre (sem acento/espaço). */
function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "doc"
  );
}

type Storage = ReturnType<typeof createAdminClient>["storage"];

async function baixar(storage: Storage, path: string): Promise<Buffer | null> {
  const { data, error } = await storage.from(DOCUMENTOS_BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Adiciona um arquivo (imagem ou PDF) ao PDF de saída. Imagens passam pelo
 * sharp (HEIC/HEIF/WEBP/PNG → JPEG + auto-rotação por EXIF) e viram uma página;
 * PDFs têm as páginas copiadas. Falha por arquivo é tratada pelo chamador.
 */
async function adicionarArquivo(pdf: PDFDocument, buf: Buffer, mime: string): Promise<void> {
  if (mime === "application/pdf") {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await pdf.copyPages(src, src.getPageIndices());
    pages.forEach((p) => pdf.addPage(p));
    return;
  }
  // Qualquer imagem → JPEG normalizado (rotação corrigida, downscale do exagero
  // de fotos de celular). HEIC/HEIF/WEBP/PNG inclusos via libvips do sharp.
  const jpeg = await sharp(buf)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const img = await pdf.embedJpg(jpeg);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
}

/**
 * Monta um PDF único com TODOS os arquivos de um `tipo` de documento, na ordem
 * em que o cliente enviou. Nome canônico: NomeCliente_Documento.pdf.
 */
export async function buildTipoPdf(
  leadId: string,
  tipo: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const rows = await db
    .select({
      storagePath: leadDocumentos.storagePath,
      mime: leadDocumentos.mime,
      rotulo: leadDocumentos.rotulo,
    })
    .from(leadDocumentos)
    .where(and(eq(leadDocumentos.leadId, leadId), eq(leadDocumentos.tipo, tipo)))
    .orderBy(asc(leadDocumentos.createdAt));
  if (rows.length === 0) return null;

  const [lead] = await db
    .select({ nome: leads.nome })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  const nome = lead?.nome ?? "Cliente";

  const storage = createAdminClient().storage;
  const pdf = await PDFDocument.create();
  for (const r of rows) {
    const buf = await baixar(storage, r.storagePath);
    if (!buf) continue;
    try {
      await adicionarArquivo(pdf, buf, r.mime ?? "");
    } catch (err) {
      console.error("[documentos-pdf] arquivo ignorado:", err);
    }
  }
  if (pdf.getPageCount() === 0) return null;

  const bytes = await pdf.save();
  const filename = `${slug(nome)}_${slug(rows[0].rotulo)}.pdf`;
  return { bytes, filename };
}

/**
 * Zip com um PDF por `tipo` de documento, cada um nomeado e numerado pela ordem.
 * Nome: NomeCliente_documentos.zip.
 */
export async function buildLeadZip(
  leadId: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const rows = await db
    .select({ tipo: leadDocumentos.tipo })
    .from(leadDocumentos)
    .where(eq(leadDocumentos.leadId, leadId))
    .orderBy(asc(leadDocumentos.createdAt));
  if (rows.length === 0) return null;

  // Tipos distintos preservando a ordem de primeira aparição.
  const tipos: string[] = [];
  for (const r of rows) if (!tipos.includes(r.tipo)) tipos.push(r.tipo);

  const [lead] = await db
    .select({ nome: leads.nome })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  const nome = lead?.nome ?? "Cliente";

  const zip = new JSZip();
  let idx = 1;
  for (const tipo of tipos) {
    const pdf = await buildTipoPdf(leadId, tipo);
    if (!pdf) continue;
    zip.file(`${String(idx).padStart(2, "0")}_${pdf.filename}`, pdf.bytes);
    idx++;
  }
  if (idx === 1) return null;

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, filename: `${slug(nome)}_documentos.zip` };
}
