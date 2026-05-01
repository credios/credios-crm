import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL não definida em .env.local.");
}

const policiesPath = join(process.cwd(), "db", "policies.sql");
const sqlText = readFileSync(policiesPath, "utf-8");

// `max: 1` evita race em statements que dependem da ordem.
const client = postgres(databaseUrl, { prepare: false, max: 1 });

async function main() {
  console.log(`📋 Aplicando ${policiesPath}...`);
  // .simple() usa o simple query protocol, que aceita múltiplos statements
  // separados por `;` no mesmo round-trip. O BEGIN/COMMIT dentro do arquivo
  // garante atomicidade.
  await client.unsafe(sqlText).simple();
  console.log("✅ Policies, view e triggers aplicados.");
  await client.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Falha aplicando policies:", err);
  await client.end();
  process.exit(1);
});
