import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";

const isDev = process.env.NODE_ENV !== "production";

// ---------------------------------------------------------------------------
// Resolução da conexão: direto vs pooler.
//
// O host DIRETO da Supabase (`db.<ref>.supabase.co:5432`, modo sessão) é
// IPv6-only. A Vercel (serverless) tem egress IPv6 instável: instâncias frias
// (toda vez que sobe um deploy novo) frequentemente NÃO conseguem abrir a
// conexão, ficam penduradas no connect_timeout e a request inteira retorna
// 500 — derrubando o app TODO (getAppUser bate no banco em toda página).
//
// O pooler Supavisor (`aws-<n>-<region>.pooler.supabase.com:6543`, modo
// transaction) é IPv4 → resolve isso. Em produção, se a DATABASE_URL apontar
// pro host direto, reescrevemos automaticamente pro pooler. Sobrescrevível por:
//   - DATABASE_POOLER_URL: connection string completa do pooler (prioridade);
//   - DATABASE_POOLER_REGION: região do pooler (default 'sa-east-1').
//
// Em dev mantemos a DATABASE_URL como está. pgbouncer/Supavisor em modo
// transaction NÃO suporta prepared statements → prepare:false é obrigatório.
// ---------------------------------------------------------------------------

type PgClient = ReturnType<typeof postgres>;

function makeClient(): PgClient {
  const baseOptions = {
    prepare: false,
    max: isDev ? 1 : 15,
    idle_timeout: isDev ? 5 : 30,
    connect_timeout: 10,
    max_lifetime: isDev ? 60 : 60 * 30,
  } as const;

  // 1. Pooler explícito via env tem prioridade.
  const explicit = process.env.DATABASE_POOLER_URL;
  if (explicit) {
    if (!isDev) console.log("[db] conexão via explicit-pooler");
    return postgres(explicit, baseOptions);
  }

  const url = process.env.DATABASE_URL;

  // 2. Em produção, reescreve host direto (IPv6) → pooler IPv4. A regex casa
  //    `db.<ref>.supabase.co:<port>`. Se não casar (já é pooler / formato
  //    inesperado / url ausente), cai no passo 3.
  const direct = url
    ? url.match(
        /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@db\.([a-z0-9]+)\.supabase\.co:(\d+)\/(\S+)$/,
      )
    : null;
  if (!isDev && direct) {
    const [, , passwordEnc, ref, , database] = direct;
    const region = process.env.DATABASE_POOLER_REGION ?? "sa-east-1";
    console.log("[db] conexão via pooler (reescrito do host direto)");
    return postgres({
      ...baseOptions,
      host: `aws-1-${region}.pooler.supabase.com`,
      port: 6543,
      username: `postgres.${ref}`,
      password: decodeURIComponent(passwordEnc!),
      database: database!.split("?")[0],
      ssl: "require",
    });
  }

  // 3. Default: usa a DATABASE_URL como está (dev, já-pooler, ou ausente —
  //    postgres() trata url ausente de forma lazy, como antes).
  if (!isDev) console.log("[db] conexão via DATABASE_URL (sem reescrita)");
  return postgres(url as string, baseOptions);
}

// Em dev (HMR), o módulo é re-importado a cada hot-reload — sem cache, cada
// reload cria um novo pool e nunca libera o antigo, esgotando o limite de
// conexões do Supabase. O cache em globalThis garante reuso entre HMR.
const globalForDb = globalThis as unknown as {
  __credios_pg__?: PgClient;
  __credios_db__?: ReturnType<typeof drizzle<typeof schema>>;
};

const client = globalForDb.__credios_pg__ ?? makeClient();

export const db = globalForDb.__credios_db__ ?? drizzle(client, { schema });

if (isDev) {
  globalForDb.__credios_pg__ = client;
  globalForDb.__credios_db__ = db;
}
