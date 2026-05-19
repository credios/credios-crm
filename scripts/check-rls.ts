/**
 * Snapshot do estado de RLS no schema `public`. Útil pra confirmar que
 * `npm run db:migrate` aplicou a migration de RLS (ex.: 0024) e que todas
 * as tabelas têm RLS habilitado + número esperado de policies.
 *
 * Uso:
 *   DATABASE_URL=postgres://... npx tsx scripts/check-rls.ts
 *
 * Por que pode precisar de override:
 *   - O DATABASE_URL no .env.local aponta pro Supabase Direct Connection
 *     (`db.<ref>.supabase.co`), que é IPv6-only. Em redes sem IPv6 (ex.:
 *     muitos ISPs residenciais brasileiros), o DNS resolve mas a conexão
 *     falha. Use o pooler URL do Supabase Dashboard (Settings → Database
 *     → Connection pooling) que é dual-stack.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente. Setar via env ou .env.local.");
  process.exit(1);
}

const sql = postgres(url, {
  prepare: false,
  max: 1,
  connect_timeout: 8,
  idle_timeout: 2,
});

async function main() {
  const rows = await sql<
    { tablename: string; rowsecurity: boolean; n_policies: number }[]
  >`
    SELECT
      t.tablename,
      t.rowsecurity,
      COALESCE((
        SELECT COUNT(*) FROM pg_policies p
        WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
      ), 0) AS n_policies
    FROM pg_tables t
    WHERE t.schemaname = 'public'
    ORDER BY t.rowsecurity ASC, t.tablename ASC
  `;

  console.log("\n=== RLS snapshot (schema public) ===");
  console.log("tablename                            | rls | n_policies");
  console.log("-".repeat(72));
  for (const r of rows) {
    const flag = r.rowsecurity ? "ON " : "OFF";
    console.log(
      `${r.tablename.padEnd(36)} | ${flag} | ${String(r.n_policies).padStart(5)}`,
    );
  }
  const semRls = rows.filter((r) => !r.rowsecurity);
  console.log(`\nTotal SEM RLS: ${semRls.length}`);
  if (semRls.length > 0) {
    console.log("  →", semRls.map((r) => r.tablename).join(", "));
    process.exitCode = 2; // sinaliza alerta no CI sem matar a verificação
  }
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
