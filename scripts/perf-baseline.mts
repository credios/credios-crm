/**
 * Foto do desempenho do banco, pra comparar antes × depois de uma mudança.
 *
 * Lê pg_stat_statements (acumulado desde o último reset — não reseta nada) e
 * grava um JSON com: as consultas do app mais caras, as consultas de relatório
 * e a carga do Realtime (varredura do log de alterações). Rodando de novo dias
 * depois com `--comparar <arquivo>`, imprime a diferença do período entre as
 * duas fotos (chamadas e tempo gasto em cada grupo).
 *
 * Uso (na raiz do credios-crm):
 *   node --env-file=.env.local --import tsx scripts/perf-baseline.mts
 *   node --env-file=.env.local --import tsx scripts/perf-baseline.mts --comparar exportacoes/perf-2026-10-15.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

function conectar() {
  const url = process.env.DATABASE_POOLER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente");
  // Host direto da Supabase é IPv6-only — localmente só o pooler responde.
  const m = url.match(
    /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@db\.([a-z0-9]+)\.supabase\.co:(\d+)\/(\S+)$/,
  );
  return m
    ? postgres({
        host: `aws-1-${process.env.DATABASE_POOLER_REGION ?? "sa-east-1"}.pooler.supabase.com`,
        port: 6543,
        user: `postgres.${m[3]}`,
        password: decodeURIComponent(m[2]!),
        database: m[5]!.split("?")[0],
        prepare: false,
        max: 1,
        ssl: "require",
      })
    : postgres(url, { prepare: false, max: 1 });
}

type Grupo = { chamadas: number; segundos: number };
type Foto = {
  em: string;
  desdeReset: string;
  grupos: Record<string, Grupo>;
  topApp: { chamadas: number; mediaMs: number; totalS: number; query: string }[];
};

// Classificação pelo texto da consulta. A ordem importa: o primeiro que casar leva.
const GRUPOS: [string, RegExp][] = [
  ["realtime_wal", /wal->>/],
  ["realtime_outros", /realtime\.|pg_publication_tables|pg_replication_slots/],
  ["refresh_mvs", /REFRESH MATERIALIZED VIEW/i],
  ["recarga_schema_postgrest", /pg_timezone_names|base_types|recurse AS|role_settings/],
  ["tipos_por_conexao", /typcategory|typarray/],
  ["auth_pooler", /pgbouncer\.get_auth|refresh_tokens|auth\.|"sessions"/],
  ["app_interacoes", /interacoes/],
  ["app_leads", /"?leads"?/],
];

async function tirarFoto(): Promise<Foto> {
  const sql = conectar();
  try {
    const [info] = await sql`select stats_reset from pg_stat_statements_info`;
    const rows = await sql<{ calls: string; total: number; mean: number; query: string }[]>`
      select calls::text, total_exec_time total, mean_exec_time mean, query
      from pg_stat_statements
      where query not ilike '%pg_stat_statements%'`;
    const grupos: Record<string, Grupo> = {};
    for (const r of rows) {
      const nome = GRUPOS.find(([, re]) => re.test(r.query))?.[0] ?? "outros";
      const g = (grupos[nome] ??= { chamadas: 0, segundos: 0 });
      g.chamadas += Number(r.calls);
      g.segundos += r.total / 1000;
    }
    const topApp = rows
      .filter((r) => /public\.|"leads"|"interacoes"|lead_/.test(r.query))
      .sort((a, b) => b.total - a.total)
      .slice(0, 25)
      .map((r) => ({
        chamadas: Number(r.calls),
        mediaMs: Math.round(r.mean * 10) / 10,
        totalS: Math.round(r.total / 100) / 10,
        query: r.query.replace(/\s+/g, " ").slice(0, 300),
      }));
    return {
      em: new Date().toISOString(),
      desdeReset: new Date(info!.stats_reset).toISOString(),
      grupos,
      topApp,
    };
  } finally {
    await sql.end();
  }
}

function imprimirGrupos(titulo: string, grupos: Record<string, Grupo>) {
  console.log(`\n${titulo}`);
  for (const [nome, g] of Object.entries(grupos).sort((a, b) => b[1].segundos - a[1].segundos)) {
    console.log(
      `  ${nome.padEnd(26)} ${String(g.chamadas).padStart(12)} chamadas  ${g.segundos.toFixed(1).padStart(10)} s`,
    );
  }
}

async function main() {
  const foto = await tirarFoto();
  const i = process.argv.indexOf("--comparar");

  if (i > 0) {
    const antes = JSON.parse(readFileSync(process.argv[i + 1]!, "utf8")) as Foto;
    if (antes.desdeReset !== foto.desdeReset) {
      console.log("⚠ pg_stat_statements foi resetado entre as fotos — a diferença não vale.");
    }
    const horas = (Date.parse(foto.em) - Date.parse(antes.em)) / 3_600_000;
    const delta: Record<string, Grupo> = {};
    for (const [nome, g] of Object.entries(foto.grupos)) {
      const a = antes.grupos[nome] ?? { chamadas: 0, segundos: 0 };
      delta[nome] = { chamadas: g.chamadas - a.chamadas, segundos: g.segundos - a.segundos };
    }
    imprimirGrupos(`Entre as fotos (${horas.toFixed(1)} h):`, delta);
    return;
  }

  imprimirGrupos(`Acumulado desde ${foto.desdeReset}:`, foto.grupos);
  const pasta = join(process.cwd(), "exportacoes");
  mkdirSync(pasta, { recursive: true });
  const arquivo = join(pasta, `perf-${foto.em.slice(0, 10)}.json`);
  writeFileSync(arquivo, JSON.stringify(foto, null, 2));
  console.log(`\n✓ foto salva em ${arquivo}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
