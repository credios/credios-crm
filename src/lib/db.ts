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
// "remaining connection slots are reserved for SUPERUSER". Em prod usamos
// max=10 — Vercel cria uma instância de função por request, então o pool
// não cresce indefinidamente.
//
// Supabase usa pgbouncer em modo transaction; prepared statements quebram
// nesse modo. prepare:false é obrigatório.
const globalForDb = globalThis as unknown as {
  __credios_pg__?: ReturnType<typeof postgres>;
  __credios_db__?: ReturnType<typeof drizzle<typeof schema>>;
};

const client =
  globalForDb.__credios_pg__ ??
  postgres(connectionString, {
    prepare: false,
    max: isDev ? 1 : 10,
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
