/**
 * Preenche `duplicidades_pendentes` com os CPFs repetidos que a checagem
 * antiga deixou passar (ela só rodava na criação pelo webhook, e o simulador
 * manda o CPF na 2ª etapa). Daqui pra frente, `registrarDuplicidadeCpf`
 * (src/lib/leads/duplicidade-cpf.ts) cobre todos os caminhos.
 *
 * Para cada lead cujo CPF já existia num lead mais antigo, registra o par
 * (lead novo → lead mais antigo com o CPF), pulando o par que já tem
 * pendência — aberta ou resolvida — em qualquer direção.
 *
 * Uso (na raiz do credios-crm):
 *   node --env-file=.env.local --import tsx scripts/backfill-duplicidades-cpf.mts            # simulação
 *   node --env-file=.env.local --import tsx scripts/backfill-duplicidades-cpf.mts --executar # grava
 */
import postgres from "postgres";

const EXECUTAR = process.argv.includes("--executar");

function conectarCrm() {
  const url = process.env.DATABASE_POOLER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL do CRM ausente");
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

async function main() {
  const sql = conectarCrm();
  try {
    const pares = await sql<
      { novo_id: string; novo_nome: string; existente_id: string; existente_nome: string; cpf: string; criado: Date }[]
    >`
      SELECT n.id AS novo_id, n.nome AS novo_nome,
             e.id AS existente_id, e.nome AS existente_nome,
             n.cpf, n.created_at AS criado
      FROM leads n
      JOIN LATERAL (
        SELECT id, nome FROM leads o
        WHERE o.cpf = n.cpf AND o.id <> n.id AND o.created_at < n.created_at
        ORDER BY o.created_at ASC
        LIMIT 1
      ) e ON true
      WHERE n.cpf IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM duplicidades_pendentes d
          WHERE (d.novo_lead_id = n.id AND d.lead_existente_id = e.id)
             OR (d.novo_lead_id = e.id AND d.lead_existente_id = n.id)
        )
      ORDER BY n.created_at
    `;

    console.log(`${pares.length} par(es) de CPF repetido sem pendência:`);
    for (const p of pares) {
      console.log(
        `  ${p.criado.toISOString().slice(0, 10)}  ${p.novo_nome}  →  ${p.existente_nome}  (${p.novo_id} → ${p.existente_id})`,
      );
    }

    if (!EXECUTAR) {
      console.log("\nSimulação — nada gravado. Rode com --executar para registrar.");
      return;
    }
    if (pares.length === 0) return;

    await sql.begin(async (tx) => {
      for (const p of pares) {
        await tx`
          INSERT INTO duplicidades_pendentes (novo_lead_id, lead_existente_id, cpf)
          VALUES (${p.novo_id}, ${p.existente_id}, ${p.cpf})
        `;
      }
    });
    console.log(`\n${pares.length} pendência(s) registrada(s) em /duplicidades.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
