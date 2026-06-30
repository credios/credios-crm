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
// transaction) é IPv4 → resolve esse problema. Em produção, se a DATABASE_URL
// apontar pro host direto, reescrevemos automaticamente pro pooler. Pode ser
// sobrescrito por:
//   - DATABASE_POOLER_URL: connection string completa do pooler (prioridade);
//   - DATABASE_POOLER_REGION: região do pooler (default 'sa-east-1').
//
// Em dev mantemos o que estiver na DATABASE_URL (sem reescrever) pra não
// surpreender quem roda local.
//
// pgbouncer/Supavisor em modo transaction NÃO suporta prepared statements →
// prepare:false é obrigatório (vale pro direto também, então deixamos sempre).
// ---------------------------------------------------------------------------

type PgOptions = Parameters<typeof postgres>[1];

function resolveConnection(): {
  connection: string;
  options: PgOptions;
  via: "pooler" | "direct" | "explicit-pooler";
} {
  const baseOptions: PgOptions = {
    prepare: false,
    max: isDev ? 1 : 15,
    idle_timeout: isDev ? 5 : 30,
    connect_timeout: 10,
    max_lifetime: isDev ? 60 : 60 * 30,
  };

  // 1. Pooler explícito via env tem prioridade.
  const explicit = process.env.DATABASE_POOLER_URL;
  if (explicit) {
    return { connection: explicit, options: baseOptions, via: "explicit-pooler" };
  }

  const url = process.env.DATABASE_URL!;

  // 2. Em produção, reescreve host direto → pooler IPv4 (Supavisor transaction).
  //    Regex casa `db.<ref>.supabase.co` (host direto). Se não casar (já é
  //    pooler, ou formato inesperado), usa a URL como veio.
  const direct = url.match(
    /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@db\.([a-z0-9]+)\.supabase\.co:(\d+)\/(\S+)$/,
  );
  if (!isDev && direct) {
    const [, , passwordEnc, ref, , database] = direct;
    const region = process.env.DATABASE_POOLER_REGION ?? "sa-east-1";
    return {
      connection: "", // usamos options.host/etc abaixo
      options: {
        ...baseOptions,
        host: `aws-1-${region}.pooler.supabase.com`,
        port: 6543,
        username: `postgres.${ref}`,
        password: decodeURIComponent(passwordEnc!),
        database: database!.split("?")[0],
        ssl: "require",
      },
      via: "pooler",
    };
  }

  // 3. Default: usa a DATABASE_URL como está (dev, ou já-pooler).
  return { connection: url, options: baseOptions, via: "direct" };
}

// Em dev (HMR), o módulo é re-importado a cada hot-reload — sem cache, cada
// reload cria um novo pool e nunca libera o antigo, esgotando o limite de
// conexões do Supabase. O cache em globalThis garante reuso entre HMR.
const globalForDb = globalThis as unknown as {
  __credios_pg__?: ReturnType<typeof postgres>;
  __credios_db__?: ReturnType<typeof drizzle<typeof schema>>;
};

function createClient(): ReturnType<typeof postgres> {
  const { connection, options, via } = resolveConnection();
  if (!isDev) {
    // Log leve no boot da instância serverless — ajuda a confirmar a rota de
    // conexão sem vazar credenciais.
    console.log(`[db] conexão via ${via}`);
  }
  // postgres() aceita (url, options) OU (options-com-host). No caso pooler,
  // connection="" e passamos host/port/etc dentro de options.
  return connection
    ? postgres(connection, options)
    : postgres(options as Record<string, unknown>);
}

const client = globalForDb.__credios_pg__ ?? createClient();

export const db =
  globalForDb.__credios_db__ ?? drizzle(client, { schema });

if (isDev) {
  globalForDb.__credios_pg__ = client;
  globalForDb.__credios_db__ = db;
}
