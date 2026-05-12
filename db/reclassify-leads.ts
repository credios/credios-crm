// ============================================================================
// Reclassifica leads antigos usando a taxonomia canônica nova (migration 0017).
// ============================================================================
// Lê `raw_payload` de cada lead e aplica classifyTouch — popula
// channel/source/paid retroativamente. Garantia: idempotente — só atualiza
// leads com source NULL ou ainda no formato legado.
//
// Flags:
//   --dry-run    Não escreve no banco. Imprime amostra de mudanças.
//   --all        Inclui leads com source já preenchido (force re-classify).
//   --limit N    Limita ao N primeiro leads (debug).
//
// Execução:
//   npx tsx db/reclassify-leads.ts --dry-run
//   npx tsx db/reclassify-leads.ts        # roda de verdade
// ============================================================================

import { config } from "dotenv";
import { eq, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { leads, trackingUnknowns } from "./schema";
import { classifyTouch } from "../src/lib/tracking/classify";
import {
  CANONICAL_SOURCE_SET,
  SOURCE_TO_CHANNEL,
  SOURCE_TO_PAID,
} from "../src/lib/tracking/taxonomy";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL ausente em .env.local");
}

const sqlClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(sqlClient);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const all = args.has("--all");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : null;

type RawPayload = Record<string, unknown>;

function getStr(p: RawPayload | null, key: string): string | undefined {
  if (!p) return undefined;
  const v = p[key];
  if (typeof v === "string" && v.trim() !== "") return v;
  return undefined;
}

async function main() {
  console.log(
    `Reclassificação retroativa de leads (dry-run=${dryRun}, all=${all}, limit=${limit ?? "todos"})…\n`,
  );

  // Filtros: por padrão só leads sem source canônico
  const whereCondition = all
    ? sql`1=1`
    : or(
        isNull(leads.source),
        sql`${leads.source} NOT IN (SELECT source FROM tracking_sources WHERE ativo = true)`,
      );

  const baseQuery = db
    .select({
      id: leads.id,
      origem: leads.origem,
      channel: leads.channel,
      source: leads.source,
      paid: leads.paid,
      rawPayload: leads.rawPayload,
      gclid: leads.gclid,
      wbraid: leads.wbraid,
      gbraid: leads.gbraid,
      msclkid: leads.msclkid,
      fbclid: leads.fbclid,
      ttclid: leads.ttclid,
      liFatId: leads.liFatId,
      twclid: leads.twclid,
      rdtCid: leads.rdtCid,
      sccid: leads.sccid,
      pinAid: leads.pinAid,
      epik: leads.epik,
      irclickid: leads.irclickid,
      cjevent: leads.cjevent,
      utmSource: leads.utmSource,
      utmMedium: leads.utmMedium,
      utmCampaign: leads.utmCampaign,
      referrer: leads.referrer,
    })
    .from(leads)
    .where(whereCondition);

  const rows = limit ? await baseQuery.limit(limit) : await baseQuery;

  console.log(`Carregados ${rows.length} leads pra reclassificar.\n`);

  const stats = {
    classified: 0,
    unchanged: 0,
    moved_to_unknown: 0,
    byChannel: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
  };

  const unknownsToInsert: Array<{
    leadId: string;
    rawOrigem: string | null;
    rawReferrer: string | null;
    rawUtmSource: string | null;
    rawUtmMedium: string | null;
    rawUtmCampaign: string | null;
    rawClickIds: Record<string, string | null>;
  }> = [];

  for (const lead of rows) {
    const rawPayload = (lead.rawPayload as RawPayload | null) ?? {};

    // Constrói input pra classifier: prefere as colunas (mais limpas) sobre
    // raw_payload, mas usa raw_payload como fallback (caso de leads antigos
    // onde alguma coluna ficou null por bug histórico).
    const result = classifyTouch({
      gclid: lead.gclid ?? getStr(rawPayload, "gclid") ?? null,
      wbraid: lead.wbraid ?? getStr(rawPayload, "wbraid") ?? null,
      gbraid: lead.gbraid ?? getStr(rawPayload, "gbraid") ?? null,
      msclkid: lead.msclkid ?? getStr(rawPayload, "msclkid") ?? null,
      fbclid: lead.fbclid ?? getStr(rawPayload, "fbclid") ?? null,
      ttclid: lead.ttclid ?? getStr(rawPayload, "ttclid") ?? null,
      li_fat_id: lead.liFatId ?? getStr(rawPayload, "li_fat_id") ?? null,
      twclid: lead.twclid ?? getStr(rawPayload, "twclid") ?? null,
      rdt_cid: lead.rdtCid ?? getStr(rawPayload, "rdt_cid") ?? null,
      sccid: lead.sccid ?? getStr(rawPayload, "sccid") ?? null,
      pin_aid: lead.pinAid ?? getStr(rawPayload, "pin_aid") ?? null,
      epik: lead.epik ?? getStr(rawPayload, "epik") ?? null,
      irclickid: lead.irclickid ?? getStr(rawPayload, "irclickid") ?? null,
      cjevent: lead.cjevent ?? getStr(rawPayload, "cjevent") ?? null,
      utm_source: lead.utmSource ?? getStr(rawPayload, "utm_source") ?? null,
      utm_medium: lead.utmMedium ?? getStr(rawPayload, "utm_medium") ?? null,
      utm_campaign: lead.utmCampaign ?? getStr(rawPayload, "utm_campaign") ?? null,
      network: getStr(rawPayload, "network") ?? null,
      referrer: lead.referrer ?? getStr(rawPayload, "referrer") ?? null,
      referrer_parsed: getStr(rawPayload, "referrer_parsed") ?? null,
    });

    // Stats
    stats.byChannel[result.channel] = (stats.byChannel[result.channel] ?? 0) + 1;
    stats.bySource[result.source] = (stats.bySource[result.source] ?? 0) + 1;

    // Sem mudança? Pula.
    if (
      lead.channel === result.channel &&
      lead.source === result.source &&
      lead.paid === result.paid
    ) {
      stats.unchanged++;
      continue;
    }

    // Source Unknown? Empurra pra quarantine (se não tiver entrada já).
    if (result.source === "Unknown" || !CANONICAL_SOURCE_SET.has(result.source)) {
      stats.moved_to_unknown++;
      unknownsToInsert.push({
        leadId: lead.id,
        rawOrigem: lead.origem,
        rawReferrer: lead.referrer,
        rawUtmSource: lead.utmSource,
        rawUtmMedium: lead.utmMedium,
        rawUtmCampaign: lead.utmCampaign,
        rawClickIds: {
          gclid: lead.gclid,
          fbclid: lead.fbclid,
          msclkid: lead.msclkid,
          ttclid: lead.ttclid,
          wbraid: lead.wbraid,
          gbraid: lead.gbraid,
          li_fat_id: lead.liFatId,
          twclid: lead.twclid,
          rdt_cid: lead.rdtCid,
          sccid: lead.sccid,
          pin_aid: lead.pinAid,
          epik: lead.epik,
          irclickid: lead.irclickid,
          cjevent: lead.cjevent,
        },
      });
    } else {
      stats.classified++;
    }

    if (!dryRun) {
      // Re-deriva paid/channel do source canônico (single source of truth)
      const channel =
        SOURCE_TO_CHANNEL[result.source] ?? result.channel;
      const paid =
        SOURCE_TO_PAID[result.source] ?? result.paid;

      await db
        .update(leads)
        .set({
          channel,
          source: result.source,
          paid,
          origem: result.source, // mirror legado
        })
        .where(eq(leads.id, lead.id));
    }
  }

  // Insere unknowns (best-effort: se já existe entry pendente pro lead, pula)
  if (!dryRun && unknownsToInsert.length > 0) {
    for (const u of unknownsToInsert) {
      await db
        .insert(trackingUnknowns)
        .values({
          leadId: u.leadId,
          rawOrigem: u.rawOrigem,
          rawReferrer: u.rawReferrer,
          rawUtmSource: u.rawUtmSource,
          rawUtmMedium: u.rawUtmMedium,
          rawUtmCampaign: u.rawUtmCampaign,
          rawClickIds: u.rawClickIds as never,
        })
        .onConflictDoNothing();
    }
  }

  // ── Print stats ─────────────────────────────────────────────────────────
  console.log("─".repeat(50));
  console.log(`Total processados:   ${rows.length}`);
  console.log(`Classificados:       ${stats.classified}`);
  console.log(`Sem mudança:         ${stats.unchanged}`);
  console.log(`Pra quarantine:      ${stats.moved_to_unknown}`);
  console.log();
  console.log("Distribuição por channel:");
  for (const [ch, n] of Object.entries(stats.byChannel).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${ch.padEnd(20)} ${n}`);
  }
  console.log();
  console.log("Top 15 sources:");
  for (const [s, n] of Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)) {
    console.log(`  ${s.padEnd(30)} ${n}`);
  }

  if (dryRun) {
    console.log("\n⚠  Dry-run — nada foi escrito. Re-rode sem --dry-run pra aplicar.");
  } else {
    console.log("\n✓ Reclassificação aplicada.");
  }

  await sqlClient.end();
}

main().catch((err) => {
  console.error("Erro na reclassificação:", err);
  process.exit(1);
});
