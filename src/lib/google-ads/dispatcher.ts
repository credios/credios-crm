import "server-only";

import { and, eq, inArray, lt } from "drizzle-orm";

import { capiOnStageChange } from "@/lib/capi/dispatch";
import { googleAdsConversions } from "../../../db/schema";
import { db } from "@/lib/db";

import {
  isGoogleAdsEnabled,
  uploadConversion,
  type GoogleAdsConversionType,
} from "./client";
import { closedValueCents, qualifiedValueCents } from "./value";

// ============================================================================
// Dispatcher de conversões offline (CRM → Google Ads).
// ============================================================================
// Chamado no ponto central de mudança de status do lead, em background
// (after()), nunca bloqueando a resposta. Persiste cada conversão antes de
// tentar o upload (idempotência + retry pelo cron /api/cron/google-ads-retry).
//
// Mapeamento de estágios → eventos:
//   Entra em "em_negociacao" (ou pula pra "fechado")        → "qualified"
//   Entra em "fechado"                                      → "closed"
//   Entra em "desqualificado"                               → marca o "qualified"
//                                                              como não-retratável
//                                                              (ver nota abaixo).
//
// ⚠️ RETRAÇÃO: a Data Manager API (events:ingest) NÃO suporta retrair/ajustar
// conversões já enviadas — o Google ainda não migrou ajustes pra ela. Então,
// quando um lead qualificado vira `desqualificado`, não há como remover o sinal
// já enviado: registramos a intenção (status `retract_unsupported`) pra
// auditoria/futuro, mas não chamamos a API. "perdido" segue sem retração (o
// lead era qualificado de verdade, só não fechou).
// ============================================================================

/**
 * Estágios que caracterizam um "Lead Qualificado": entrou em negociação.
 * `fechado` entra aqui também porque um lead pode pular direto pra fechado sem
 * passar por em_negociacao — a idempotência garante 1 envio só.
 */
const QUALIFIED_STAGES = new Set(["em_negociacao", "fechado"]);

/** Tentativas máximas antes de desistir (ex.: rejeição definitiva por janela). */
const MAX_ATTEMPTS = 8;

/** Subconjunto de campos do lead que o dispatcher precisa. */
export type LeadForConversion = {
  id: string;
  gclid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  valorCreditoCentavos: number | null;
  valorLiberadoCentavos: number | null;
  comissaoCentavos: number | null;
};

type ConversionRow = typeof googleAdsConversions.$inferSelect;

/**
 * Ponto de entrada: reage a uma mudança de status do lead.
 * No-op se o Google Ads não estiver configurado ou se o lead não for de Ads.
 */
export async function onLeadStageChange(
  lead: LeadForConversion,
  newStatus: string,
): Promise<void> {
  // CAPI (Meta/TikTok/LinkedIn) roda ANTES dos early-returns do Google Ads —
  // são gates independentes (lead orgânico do Insta não tem gclid, mas tem
  // fbclid). Best-effort; adapters não configurados retornam skipped.
  await capiOnStageChange(lead as never, newStatus).catch((e) =>
    console.error("[capi] stage change falhou:", e),
  );

  if (!isGoogleAdsEnabled()) return;
  const isAds = lead.gclid || lead.wbraid || lead.gbraid;
  if (!isAds) return; // orgânico/direto → no-op

  if (QUALIFIED_STAGES.has(newStatus)) {
    await sendOnce(lead, "qualified", qualifiedValueCents(lead.valorCreditoCentavos));
  }
  if (newStatus === "fechado") {
    await sendOnce(lead, "closed", closedValueCents(lead));
  }
  if (newStatus === "desqualificado") {
    await markQualifiedNotRetractable(lead.id);
  }
}

/**
 * Insere o registro (se ainda não existe) e tenta o upload uma vez.
 * UNIQUE(lead_id, conversion_action) garante 1 envio por evento por lead.
 */
async function sendOnce(
  lead: LeadForConversion,
  type: GoogleAdsConversionType,
  valueCents: number,
): Promise<void> {
  const inserted = await db
    .insert(googleAdsConversions)
    .values({
      leadId: lead.id,
      conversionAction: type,
      orderId: lead.id,
      gclid: lead.gclid,
      wbraid: lead.wbraid,
      gbraid: lead.gbraid,
      valueCents,
      currency: "BRL",
      conversionAt: new Date(),
      status: "pending",
    })
    .onConflictDoNothing({
      target: [
        googleAdsConversions.leadId,
        googleAdsConversions.conversionAction,
      ],
    })
    .returning();

  if (inserted.length === 0) return; // já existe → não reenvia
  await attemptUpload(inserted[0]);
}

/** Tenta o upload de uma linha pendente/falha e atualiza o status. */
async function attemptUpload(rec: ConversionRow): Promise<void> {
  try {
    await uploadConversion({
      type: rec.conversionAction as GoogleAdsConversionType,
      orderId: rec.orderId,
      gclid: rec.gclid,
      wbraid: rec.wbraid,
      gbraid: rec.gbraid,
      valueCents: rec.valueCents,
      conversionAt: rec.conversionAt,
    });
    await db
      .update(googleAdsConversions)
      .set({
        status: "uploaded",
        uploadedAt: new Date(),
        attempts: rec.attempts + 1,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(googleAdsConversions.id, rec.id));
  } catch (e) {
    await db
      .update(googleAdsConversions)
      .set({
        status: "failed",
        attempts: rec.attempts + 1,
        error: errMsg(e),
        updatedAt: new Date(),
      })
      .where(eq(googleAdsConversions.id, rec.id));
  }
}

/**
 * Lead qualificado virou `desqualificado`: a Data Manager API não permite
 * retrair a conversão já enviada. Registramos a intenção (`retract_unsupported`)
 * pra auditoria — não há chamada de API. No-op se nunca chegou a subir.
 */
async function markQualifiedNotRetractable(leadId: string): Promise<void> {
  const [rec] = await db
    .select()
    .from(googleAdsConversions)
    .where(
      and(
        eq(googleAdsConversions.leadId, leadId),
        eq(googleAdsConversions.conversionAction, "qualified"),
      ),
    )
    .limit(1);
  if (!rec || rec.status !== "uploaded") return;
  await db
    .update(googleAdsConversions)
    .set({
      status: "retract_unsupported",
      error:
        "Lead desqualificado após envio; Data Manager API não suporta retração.",
      updatedAt: new Date(),
    })
    .where(eq(googleAdsConversions.id, rec.id));
}

/**
 * Reprocessa pendências (chamado pelo cron). Re-tenta uploads `pending`/`failed`,
 * respeitando MAX_ATTEMPTS.
 */
export async function reprocessGoogleAdsConversions(
  limit = 50,
): Promise<{ skipped?: boolean; uploads: number }> {
  if (!isGoogleAdsEnabled()) return { skipped: true, uploads: 0 };

  const pendingUploads = await db
    .select()
    .from(googleAdsConversions)
    .where(
      and(
        inArray(googleAdsConversions.status, ["pending", "failed"]),
        lt(googleAdsConversions.attempts, MAX_ATTEMPTS),
      ),
    )
    .limit(limit);
  for (const rec of pendingUploads) await attemptUpload(rec);

  return { uploads: pendingUploads.length };
}

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 1000);
}
