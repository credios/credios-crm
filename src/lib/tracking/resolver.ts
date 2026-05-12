// ============================================================================
// Source resolver — server-side normalization against tracking_sources DB
// ============================================================================
// `classifyTouch` (em classify.ts) é pura: roda no client (site) e no server
// (CRM) com mesma lógica e fontes canônicas em arquivo.
//
// Este resolver vai ALÉM: consulta a tabela `tracking_sources` (catálogo
// editável pelo admin) e `tracking_source_aliases` (mapping utm_source bruto
// → source canônico).  Útil quando:
//   1. Admin criou source customizado pela UI que não está no constants.ts
//   2. Lead trouxe utm_source que matches um alias dinâmico
//
// Combinação: classifyTouch resolve as fontes "core" (Google Ads, Meta,
// ChatGPT, etc) instantaneamente sem hit DB. resolver hits DB só pra
// dúvidas ou alias customizados.
// ============================================================================

import { eq, sql } from "drizzle-orm";

import { trackingSourceAliases, trackingSources } from "../../../db/schema";
import { db } from "@/lib/db";
import {
  classifyTouch,
  validateClientClassification,
  type ClassifyInput,
  type ClassifyResult,
} from "./classify";
import { CANONICAL_SOURCE_SET, SOURCE_TO_CHANNEL, SOURCE_TO_PAID } from "./taxonomy";

/**
 * Resolve source + channel + paid pra um lead, combinando:
 *   1. Classificação pura (classifyTouch) — cobre 99% dos casos
 *   2. Lookup de alias dinâmico se utm_source não conhecido
 *   3. Validação contra tabela `tracking_sources` (active=true)
 *
 * Se source resultante NÃO está em tracking_sources ativos, vira "Unknown"
 * e o caller deve criar uma entry em tracking_unknowns pra quarantine.
 */
export async function resolveSource(
  input: ClassifyInput & {
    /** Source vindo do client (se ele já classificou) */
    clientSource?: string | null;
    clientChannel?: string | null;
    clientPaid?: boolean | null;
  },
): Promise<ClassifyResult & { active_in_db: boolean }> {
  // 1. Se client mandou classificação, valida contra taxonomia in-memory
  let result: ClassifyResult;
  if (input.clientSource) {
    const validated = validateClientClassification(
      input.clientSource,
      input.clientChannel,
      input.clientPaid ?? null,
      input,
    );
    result = validated;
  } else {
    result = classifyTouch(input);
  }

  // 2. Se source é "Unknown" mas tem utm_source, tenta alias dinâmico do DB
  if (result.source === "Unknown" && input.utm_source) {
    const alias = input.utm_source.trim().toLowerCase();
    const [aliasRow] = await db
      .select({ source: trackingSourceAliases.source })
      .from(trackingSourceAliases)
      .where(eq(trackingSourceAliases.alias, alias))
      .limit(1);

    if (aliasRow && CANONICAL_SOURCE_SET.has(aliasRow.source)) {
      result = {
        source: aliasRow.source,
        channel: SOURCE_TO_CHANNEL[aliasRow.source]!,
        paid: SOURCE_TO_PAID[aliasRow.source] ?? false,
        reason: "utm_alias",
      };
    }
  }

  // 3. Confirma que o source existe e está ativo no DB
  // (Admin pode ter desativado um source temporariamente.)
  const [srcRow] = await db
    .select({
      source: trackingSources.source,
      channel: trackingSources.channel,
      paid: trackingSources.paid,
      ativo: trackingSources.ativo,
    })
    .from(trackingSources)
    .where(eq(trackingSources.source, result.source))
    .limit(1);

  // Se não achou ou está inativo, força "Unknown" + quarantine
  if (!srcRow || !srcRow.ativo) {
    return {
      ...result,
      source: "Unknown",
      // Mantém channel da classificação como hint pro admin classificar
      active_in_db: false,
    };
  }

  // Source ativo: usa channel/paid do DB (admin pode ter ajustado)
  return {
    source: srcRow.source,
    channel: srcRow.channel as ClassifyResult["channel"],
    paid: srcRow.paid,
    reason: result.reason,
    matched_id: result.matched_id,
    active_in_db: true,
  };
}

/**
 * Lista todos os sources ativos do DB, ordenados por `ordem`.
 * Usado pra popular filtros dinâmicos na UI.
 *
 * Cache: caller pode usar Next `unstable_cache` se quiser memoizar
 * (mudança via admin invalida).
 */
export async function listActiveSources(): Promise<
  Array<{
    source: string;
    channel: string;
    paid: boolean;
    displayName: string;
    color: string | null;
    icon: string | null;
    ordem: number;
  }>
> {
  return await db
    .select({
      source: trackingSources.source,
      channel: trackingSources.channel,
      paid: trackingSources.paid,
      displayName: trackingSources.displayName,
      color: trackingSources.color,
      icon: trackingSources.icon,
      ordem: trackingSources.ordem,
    })
    .from(trackingSources)
    .where(eq(trackingSources.ativo, true))
    .orderBy(trackingSources.ordem, trackingSources.source);
}

/**
 * Lista channels distintos com contagem de sources ativos cada — pra UI
 * de filtro hierárquico (Channel → Source).
 */
export async function listChannelsWithCounts(): Promise<
  Array<{ channel: string; count: number }>
> {
  const rows = await db
    .select({
      channel: trackingSources.channel,
      count: sql<number>`count(*)::int`,
    })
    .from(trackingSources)
    .where(eq(trackingSources.ativo, true))
    .groupBy(trackingSources.channel);
  return rows;
}
