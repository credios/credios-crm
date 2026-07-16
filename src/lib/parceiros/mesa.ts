import "server-only";

import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { leads as leadsTable, parceiros } from "../../../db/schema";
import { db } from "@/lib/db";

// Cards de parceiros pra Mesa. Três sinais, em ordem de urgência:
//   1. TRIAGEM (admin, global): candidato novo sem dono — decisão do Gabriel.
//   2. SEM 1º CONTATO: atribuído a mim, status novo, sem nenhum contato há
//      mais de 1 dia útil (aqui: 24h corridas — B2B não precisa dos 30min).
//   3. ESFRIANDO: em andamento sem contato há 14+ dias, OU parceiro ATIVO
//      sem indicação nova há 60+ dias (farming do canal).

export type ParceiroMesaItem = {
  id: string;
  nome: string;
  empresa: string | null;
  segmento: string | null;
  whatsapp: string | null;
  status: string;
  motivo: string;
  criadoEm: Date;
};

export async function getParceirosTriagem(): Promise<ParceiroMesaItem[]> {
  const rows = await db
    .select({
      id: parceiros.id,
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      segmento: parceiros.segmento,
      whatsapp: parceiros.whatsapp,
      status: parceiros.status,
      criadoEm: parceiros.createdAt,
    })
    .from(parceiros)
    .where(and(eq(parceiros.status, "novo"), isNull(parceiros.consultorId)))
    .orderBy(desc(parceiros.createdAt))
    .limit(10);
  return rows.map((r) => ({ ...r, motivo: "Aguardando triagem" }));
}

export async function getParceirosAtencao(
  consultorId: string,
): Promise<ParceiroMesaItem[]> {
  const h24 = new Date(Date.now() - 24 * 60 * 60_000);
  const d14 = new Date(Date.now() - 14 * 24 * 60 * 60_000);

  // Sem 1º contato (24h) + esfriando (14d) — um SELECT só.
  const rows = await db
    .select({
      id: parceiros.id,
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      segmento: parceiros.segmento,
      whatsapp: parceiros.whatsapp,
      status: parceiros.status,
      criadoEm: parceiros.createdAt,
      ultimoContato: parceiros.ultimoContato,
    })
    .from(parceiros)
    .where(
      and(
        eq(parceiros.consultorId, consultorId),
        or(
          // novo atribuído há 24h+ sem contato nenhum
          and(
            eq(parceiros.status, "novo"),
            isNull(parceiros.ultimoContato),
            lt(parceiros.atribuidoEm, h24),
          ),
          // em andamento, parado há 14d+
          and(
            sql`${parceiros.status} IN ('em_contato','reuniao','proposta_enviada','convidado_portal')`,
            or(
              lt(parceiros.ultimoContato, d14),
              and(isNull(parceiros.ultimoContato), lt(parceiros.createdAt, d14)),
            ),
          ),
        ),
      ),
    )
    .orderBy(parceiros.ultimoContato)
    .limit(10);

  const atencao: ParceiroMesaItem[] = rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    empresa: r.empresa,
    segmento: r.segmento,
    whatsapp: r.whatsapp,
    status: r.status,
    criadoEm: r.criadoEm,
    motivo:
      r.status === "novo" ? "Sem 1º contato há 24h+" : "Sem contato há 14+ dias",
  }));

  // Farming: parceiro ATIVO cuja última indicação tem 60+ dias (ou nenhuma).
  const d60 = new Date(Date.now() - 60 * 24 * 60 * 60_000);
  const ativos = await db
    .select({
      id: parceiros.id,
      nome: parceiros.nome,
      empresa: parceiros.empresa,
      segmento: parceiros.segmento,
      whatsapp: parceiros.whatsapp,
      status: parceiros.status,
      criadoEm: parceiros.createdAt,
      ultimaIndicacao: sql<Date | null>`(
        SELECT MAX(${leadsTable.createdAt}) FROM ${leadsTable}
        WHERE ${leadsTable.parceiroPortalId} = ${parceiros.portalPartnerId}
      )`,
    })
    .from(parceiros)
    .where(
      and(
        eq(parceiros.consultorId, consultorId),
        eq(parceiros.status, "ativo"),
        lt(parceiros.ativoEm, d60),
        or(isNull(parceiros.ultimoContato), lt(parceiros.ultimoContato, d60)),
      ),
    )
    .limit(5);

  for (const a of ativos) {
    const ultima = a.ultimaIndicacao ? new Date(a.ultimaIndicacao) : null;
    if (!ultima || ultima < d60) {
      atencao.push({
        id: a.id,
        nome: a.nome,
        empresa: a.empresa,
        segmento: a.segmento,
        whatsapp: a.whatsapp,
        status: a.status,
        criadoEm: a.criadoEm,
        motivo: ultima
          ? "Ativo sem indicação há 60+ dias"
          : "Ativo sem nenhuma indicação ainda",
      });
    }
  }

  return atencao.slice(0, 10);
}
