import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";

const connectionString = process.env.DATABASE_URL!;
const isDev = process.env.NODE_ENV !== "production";

// Em dev (HMR), o módulo é re-importado a cada hot-reload — sem cache, cada
// reload cria um novo pool e nunca libera o antigo, esgotando o limite de
// conexões do Supabase. O cache em globalThis garante reuso entre HMR.
//
// max=1 em dev: única conexão por processo. Múltiplas tabs/refresh viram
// queries serializadas (latência mínima local), mas ZERO chance de hit no
// "remaining connection slots are reserved for SUPERUSER". Em prod, mesmo com
// Supabase pooler, cada instância serverless pode abrir seu próprio mini-pool.
// Mantemos o default conservador e ajustável por DATABASE_POOL_MAX.
//
// Supabase usa pgbouncer em modo transaction; prepared statements quebram
// nesse modo. prepare:false é obrigatório.
const globalForDb = globalThis as unknown as {
  __credios_pg__?: ReturnType<typeof postgres>;
  __credios_db__?: ReturnType<typeof drizzle<typeof schema>>;
};

const configuredPoolMax = Number.parseInt(
  process.env.DATABASE_POOL_MAX ?? "",
  10,
);
const poolMax =
  Number.isFinite(configuredPoolMax) && configuredPoolMax > 0
    ? configuredPoolMax
    : isDev
      ? 1
      : 3;

const client =
  globalForDb.__credios_pg__ ??
  postgres(connectionString, {
    prepare: false,
    max: poolMax,
    idle_timeout: isDev ? 5 : 30,
    connect_timeout: 10,
    max_lifetime: isDev ? 60 : 60 * 30,
  });

export const db =
  globalForDb.__credios_db__ ?? drizzle(client, { schema });

if (isDev) {
  globalForDb.__credios_pg__ = client;
  globalForDb.__credios_db__ = db;
}
