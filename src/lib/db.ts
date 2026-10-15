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

const MAX_CONEXOES = 15;

// ---------------------------------------------------------------------------
// Limite de consultas em voo.
//
// O pooler em modo transaction (porta 6543) TRAVA quando o postgres-js empilha
// 4+ consultas na mesma conexão (pipelining). Medido em 2026-10-15 contra
// produção: max=15 com 15 consultas paralelas → 0,3 s; com 40 → travado por
// 10 s+. No modo session (5432) as mesmas consultas passam — o problema é o
// pooler, e a opção `max_pipeline` do postgres-js não resolve.
//
// Quando todas as conexões estão ocupadas o postgres-js empilha a consulta
// numa conexão já ocupada em vez de esperar. Um relatório com cache frio
// dispara ~40 consultas de uma vez → seções presas até o timeout de 25 s.
// Este limitador segura as consultas excedentes numa fila do app até uma
// conexão liberar: nunca mais consultas em voo do que conexões.
//
// Só `unsafe` passa por aqui — é por onde o Drizzle executa tudo. Transações
// (`begin`) usam a própria conexão reservada e não são contadas.
// ---------------------------------------------------------------------------
function limitarConsultasEmVoo(client: PgClient, limite: number): PgClient {
  let emVoo = 0;
  const fila: Array<() => void> = [];

  function adquirir(): Promise<void> {
    if (emVoo < limite) {
      emVoo++;
      return Promise.resolve();
    }
    return new Promise((resolve) => fila.push(resolve));
  }

  function liberar() {
    const proxima = fila.shift();
    // Passa a vaga direto pra próxima da fila (emVoo não muda).
    if (proxima) proxima();
    else emVoo--;
  }

  async function comVaga<T>(executar: () => PromiseLike<T>): Promise<T> {
    await adquirir();
    try {
      return await executar();
    } finally {
      liberar();
    }
  }

  return new Proxy(client, {
    get(alvo, prop, receiver) {
      if (prop !== "unsafe") return Reflect.get(alvo, prop, receiver);
      // A consulta do postgres-js é preguiçosa: só executa no `then` ou no
      // `.values()`. O substituto mantém isso — sem executar duas vezes.
      return (...args: Parameters<PgClient["unsafe"]>) => ({
        then<A, B>(
          ok?: ((v: unknown) => A | PromiseLike<A>) | null,
          erro?: ((e: unknown) => B | PromiseLike<B>) | null,
        ) {
          return comVaga(() => alvo.unsafe(...args)).then(ok, erro);
        },
        values() {
          return comVaga(() => alvo.unsafe(...args).values());
        },
      });
    },
  });
}

function makeClient(): PgClient {
  const baseOptions = {
    prepare: false,
    max: isDev ? 1 : MAX_CONEXOES,
    // 240s (era 30): conexão nova com o pooler custa ~0,3–0,4 s (TLS + auth +
    // busca de tipos do postgres-js). Com Fluid compute a instância vive entre
    // requests; fechar a conexão após 30s parada fazia quem voltava à tela
    // logo depois pagar tudo de novo.
    idle_timeout: isDev ? 5 : 240,
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

const client =
  globalForDb.__credios_pg__ ??
  limitarConsultasEmVoo(makeClient(), isDev ? 1 : MAX_CONEXOES);

export const db = globalForDb.__credios_db__ ?? drizzle(client, { schema });

if (isDev) {
  globalForDb.__credios_pg__ = client;
  globalForDb.__credios_db__ = db;
}
