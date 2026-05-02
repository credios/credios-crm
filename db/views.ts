// Materialized views criadas em db/migrations/0010.
//
// Drizzle não tem suporte completo a materialized views — declaramos como
// pgTable pra obter typing/builder no consumo. Importante: ESTE ARQUIVO
// NÃO É IMPORTADO POR db/schema.ts, então drizzle-kit ignora e não tenta
// gerar migrations pra recriar essas "tabelas".
//
// Refresh: cron a cada 30 min via /api/cron/refresh-mvs (REFRESH
// MATERIALIZED VIEW CONCURRENTLY). Trade-off: dados ficam até 30 min
// defasados nos dashboards.
//
// Convenção de NULLs: a MV substitui NULL por valor sentinela pra que
// UNIQUE INDEX (requerido pelo REFRESH CONCURRENTLY) funcione. Consumidores:
//   - origem: 'Sem origem'
//   - estado: '—'
//   - consultor_id: '00000000-0000-0000-0000-000000000000'::uuid (POOL)

import { bigint, date, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const POOL_CONSULTOR_ID = "00000000-0000-0000-0000-000000000000";

export const mvLeadsDiarios = pgTable("mv_leads_diarios", {
  diaCriacao: date("dia_criacao").notNull(),
  origem: text("origem").notNull(),
  estado: text("estado").notNull(),
  consultorId: uuid("consultor_id").notNull(),
  status: text("status").notNull(),
  qtd: integer("qtd").notNull(),
  somaValorCredito: bigint("soma_valor_credito", { mode: "number" }).notNull(),
  somaValorLiberado: bigint("soma_valor_liberado", { mode: "number" }).notNull(),
  somaComissao: bigint("soma_comissao", { mode: "number" }).notNull(),
});

export const mvFechadosDiarios = pgTable("mv_fechados_diarios", {
  diaFechamento: date("dia_fechamento").notNull(),
  origem: text("origem").notNull(),
  estado: text("estado").notNull(),
  consultorId: uuid("consultor_id").notNull(),
  qtd: integer("qtd").notNull(),
  somaValorLiberado: bigint("soma_valor_liberado", { mode: "number" }).notNull(),
  somaComissao: bigint("soma_comissao", { mode: "number" }).notNull(),
  somaSegundosCiclo: bigint("soma_segundos_ciclo", { mode: "number" }).notNull(),
});
