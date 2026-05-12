// ============================================================================
// Seed inicial das tabelas tracking_sources e tracking_source_aliases.
// ============================================================================
// Idempotente: roda múltiplas vezes sem duplicar (ON CONFLICT DO NOTHING).
// Conteúdo vem de src/lib/tracking/taxonomy.ts — fonte da verdade canônica.
//
// Execução:
//   pnpm tsx db/seed-tracking.ts
// ============================================================================

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { trackingSources, trackingSourceAliases } from "./schema";
import {
  CANONICAL_SOURCES,
  UTM_SOURCE_ALIASES,
} from "../src/lib/tracking/taxonomy";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL ausente em .env.local");
}

const sqlClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(sqlClient);

async function seedSources() {
  console.log(`Inserindo ${CANONICAL_SOURCES.length} sources canônicos...`);
  for (const s of CANONICAL_SOURCES) {
    await db
      .insert(trackingSources)
      .values({
        source: s.source,
        channel: s.channel,
        paid: s.paid,
        displayName: s.source,
        color: s.color,
        icon: s.icon,
        ordem: s.ordem,
        ativo: true,
      })
      .onConflictDoNothing({ target: trackingSources.source });
  }
  console.log("✓ Sources inseridos");
}

async function seedAliases() {
  const entries = Object.entries(UTM_SOURCE_ALIASES);
  console.log(`Inserindo ${entries.length} aliases...`);
  for (const [alias, source] of entries) {
    await db
      .insert(trackingSourceAliases)
      .values({ alias, source })
      .onConflictDoNothing({ target: trackingSourceAliases.alias });
  }
  console.log("✓ Aliases inseridos");
}

async function main() {
  await seedSources();
  await seedAliases();
  await sqlClient.end();
  console.log("\n✓ Seed de tracking concluído.");
}

main().catch((err) => {
  console.error("Erro no seed de tracking:", err);
  process.exit(1);
});
