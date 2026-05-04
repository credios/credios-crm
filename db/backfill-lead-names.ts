/**
 * Backfill: aplica formatProperName em todos os leads existentes e remove
 * prefixos legados como "[GADS] " (que o site adicionava antes — o site já
 * foi corrigido, mas leads antigos seguem com o prefixo no banco).
 *
 * Idempotente: se o nome já estiver na forma canônica, o UPDATE é skipado
 * (não toca em updated_at).
 *
 * Uso:
 *   npx tsx db/backfill-lead-names.ts          # dry-run (preview, não grava)
 *   npx tsx db/backfill-lead-names.ts --apply  # executa as alterações
 */

/** Remove prefixos legados em colchetes (ex: "[GADS] Maria" → "Maria"). */
function stripLegacyTagPrefix(name: string): string {
  return name.replace(/^\s*\[[A-Za-z0-9_-]+\]\s*/, "");
}

import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { leads } from "./schema";
import { formatProperName } from "../src/lib/formatters/proper-name";

config({ path: ".env.local" });

const apply = process.argv.includes("--apply");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente em .env.local");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  console.log(`\nMode: ${apply ? "APPLY (gravando)" : "DRY-RUN (preview)"}\n`);

  const allLeads = await db
    .select({ id: leads.id, nome: leads.nome })
    .from(leads);

  console.log(`Total de leads: ${allLeads.length}\n`);

  let mudados = 0;
  let inalterados = 0;
  const exemplos: Array<{ from: string; to: string }> = [];

  for (const lead of allLeads) {
    // Tira prefixo legado ("[GADS] ", "[META] " etc) ANTES de capitalizar,
    // senão o formatProperName trataria "[gads]" como uma "palavra" comum.
    const stripped = stripLegacyTagPrefix(lead.nome);
    const formatted = formatProperName(stripped);
    if (formatted === lead.nome) {
      inalterados++;
      continue;
    }
    mudados++;
    if (exemplos.length < 20) {
      exemplos.push({ from: lead.nome, to: formatted });
    }
    if (apply) {
      await db.update(leads).set({ nome: formatted }).where(eq(leads.id, lead.id));
    }
  }

  console.log(`Inalterados: ${inalterados}`);
  console.log(`A ${apply ? "alterar" : "alterados (preview)"}: ${mudados}\n`);

  if (exemplos.length > 0) {
    console.log("Primeiros exemplos:");
    for (const ex of exemplos) {
      console.log(`  ${JSON.stringify(ex.from)}  →  ${JSON.stringify(ex.to)}`);
    }
    if (mudados > exemplos.length) {
      console.log(`  ... e mais ${mudados - exemplos.length} leads.`);
    }
  }

  if (!apply && mudados > 0) {
    console.log(
      "\nPara aplicar de fato, rode: npx tsx db/backfill-lead-names.ts --apply",
    );
  } else if (apply) {
    console.log("\nBackfill concluído.");
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
