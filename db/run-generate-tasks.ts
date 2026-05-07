/**
 * Geração manual das tarefas diárias — replica a lógica de
 * src/lib/tasks/service.ts em SQL puro pra rodar sem o módulo do Next
 * (que tem `server-only` e bloqueia tsx fora do servidor).
 *
 * Uso: npx tsx db/run-generate-tasks.ts
 *
 * Idempotente: filtro `NOT EXISTS tarefa aberta` impede duplicação.
 */

import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const STATUS_EXCLUDED = ["fechado", "perdido", "desqualificado"];

function todayYmdBrt(now: Date = new Date()): string {
  // Equivalente a `formatInTimeZone(now, "America/Sao_Paulo", "yyyy-MM-dd")`.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

function endOfBusinessDayBrt(ymd: string): Date {
  // 18:00 BRT = 21:00 UTC (BRT é UTC-3, sem horário de verão desde 2019).
  return new Date(`${ymd}T21:00:00Z`);
}

function isBusinessDayBrt(now: Date = new Date()): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(now);
  // Mon..Fri
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(wd);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente em .env.local");

  const now = new Date();
  const dataReferencia = todayYmdBrt(now);
  const businessDay = isBusinessDayBrt(now);

  console.log(`Data referência (BRT): ${dataReferencia}`);
  console.log(`Dia útil: ${businessDay}`);
  if (!businessDay) {
    console.log("Não é dia útil — encerrando sem gerar tarefas.");
    process.exit(0);
  }

  const venceEm = endOfBusinessDayBrt(dataReferencia);
  console.log(`Vence em: ${venceEm.toISOString()}\n`);

  const sql = postgres(url, { max: 1 });

  // 1. Marca atrasadas (vence_em < now AND aberta).
  const overdue = await sql`
    UPDATE tarefas
    SET status = 'atrasada'
    WHERE status = 'aberta' AND vence_em < ${now}
    RETURNING id
  `;
  console.log(`Tarefas marcadas como atrasadas: ${overdue.length}`);

  // 2. Lê configs ativas.
  const configs = await sql<
    {
      status_key: string;
      titulo: string;
      descricao: string | null;
      frequencia_dias: number;
    }[]
  >`
    SELECT status_key, titulo, descricao, frequencia_dias
    FROM task_config_por_status
    WHERE ativo = true
  `;
  if (configs.length === 0) {
    console.log("\n⚠ Nenhuma config ativa. Encerrando.");
    await sql.end();
    process.exit(0);
  }
  const configByStatus = new Map(configs.map((c) => [c.status_key, c]));
  const activeStatusKeys = configs.map((c) => c.status_key);
  console.log(`Configs ativas: ${activeStatusKeys.length} (${activeStatusKeys.join(", ")})`);

  // 3. Leads candidatos.
  const candidates = await sql<
    {
      id: string;
      status: string;
      consultor_id: string;
      last_task_date: string | null;
    }[]
  >`
    SELECT
      l.id,
      l.status,
      l.consultor_id,
      (SELECT MAX(t.data_referencia)::text FROM tarefas t WHERE t.lead_id = l.id) AS last_task_date
    FROM leads l
    JOIN users u ON u.id = l.consultor_id
    WHERE l.consultor_id IS NOT NULL
      AND u.ativo = true
      AND l.status NOT IN ${sql(STATUS_EXCLUDED)}
      AND l.status IN ${sql(activeStatusKeys)}
      AND NOT EXISTS (
        SELECT 1 FROM tarefas t
        WHERE t.lead_id = l.id AND t.status IN ('aberta', 'atrasada')
      )
  `;
  console.log(`Leads candidatos (sem tarefa aberta): ${candidates.length}`);

  // 4. Filtra por frequência (calendar days).
  const todayMs = new Date(dataReferencia + "T00:00:00Z").getTime();
  const due = candidates.filter((r) => {
    const cfg = configByStatus.get(r.status);
    if (!cfg) return false;
    if (!r.last_task_date) return true;
    const lastMs = new Date(r.last_task_date + "T00:00:00Z").getTime();
    const diffDays = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24));
    return diffDays >= cfg.frequencia_dias;
  });
  console.log(`Leads que satisfazem frequência: ${due.length}\n`);

  if (due.length === 0) {
    console.log("Nada pra inserir. Encerrando.");
    await sql.end();
    process.exit(0);
  }

  // 5. Insere tarefas em batch.
  const values = due.map((r) => {
    const cfg = configByStatus.get(r.status)!;
    return {
      lead_id: r.id,
      consultor_id: r.consultor_id,
      tipo: "contato_diario",
      titulo: cfg.titulo,
      descricao: cfg.descricao,
      data_referencia: dataReferencia,
      vence_em: venceEm,
    };
  });
  const inserted = await sql`INSERT INTO tarefas ${sql(values)} ON CONFLICT DO NOTHING RETURNING id`;
  console.log(`✓ ${inserted.length} tarefas inseridas.`);

  // 6. Conta total ativo pós-execução pro relatório.
  const activeAfter = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM tarefas WHERE status IN ('aberta', 'atrasada')
  `;
  console.log(`Total de tarefas abertas/atrasadas agora: ${activeAfter[0].n}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
