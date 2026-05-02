import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { leads as leadsTable, users as usersTable } from "../../../db/schema";
import { type AppUser } from "@/lib/auth/get-app-user";
import { maskLeadForPerfil } from "@/lib/auth/mascaramento";
import { db } from "@/lib/db";

export type GoogleAdsLeadRow = {
  id: string;
  nome: string;
  cpf: string | null;
  whatsapp: string | null;
  email: string | null;
  status: string;
  origem: string | null;
  consultorNome: string | null;
  valorCreditoCentavos: number | null;
  ultimoContato: Date | null;
  createdAt: Date;
  utmCampaign: string | null;
  palavraChave: string | null;
  gclid: string | null;
  rede: string | null;
  rendaMensalCentavos: number | null;
  bancoAprovador: string | null;
  valorLiberadoCentavos: number | null;
  comissaoCentavos: number | null;
};

/** Query especializada da página /relatorios/google-ads. Inclui colunas de tracking. */
export async function listLeadsGoogleAds(
  user: AppUser,
  filters: { from: Date; to: Date; q?: string },
): Promise<GoogleAdsLeadRow[]> {
  const conds = [
    eq(leadsTable.origem, "Google"),
    gte(leadsTable.createdAt, filters.from),
    lte(leadsTable.createdAt, filters.to),
  ];

  if (user.perfil === "consultor") {
    conds.push(eq(leadsTable.consultorId, user.id));
  }
  if (filters.q) {
    const like = `%${filters.q}%`;
    conds.push(
      or(
        ilike(leadsTable.nome, like),
        ilike(leadsTable.email, like),
        ilike(leadsTable.utmCampaign, like),
        ilike(leadsTable.palavraChave, like),
      )!,
    );
  }
  void inArray; // silence

  const rows = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      cpf: leadsTable.cpf,
      whatsapp: leadsTable.whatsapp,
      email: leadsTable.email,
      status: leadsTable.status,
      origem: leadsTable.origem,
      consultorNome: usersTable.nome,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      ultimoContato: leadsTable.ultimoContato,
      createdAt: leadsTable.createdAt,
      utmCampaign: leadsTable.utmCampaign,
      palavraChave: leadsTable.palavraChave,
      gclid: leadsTable.gclid,
      rede: leadsTable.rede,
      rendaMensalCentavos: leadsTable.rendaMensalCentavos,
      bancoAprovador: leadsTable.bancoAprovador,
      valorLiberadoCentavos: leadsTable.valorLiberadoCentavos,
      comissaoCentavos: leadsTable.comissaoCentavos,
    })
    .from(leadsTable)
    .leftJoin(usersTable, eq(usersTable.id, leadsTable.consultorId))
    .where(and(...conds))
    .orderBy(desc(leadsTable.createdAt))
    .limit(500);

  void sql;
  return rows.map((r) => maskLeadForPerfil(r, user.perfil)) as GoogleAdsLeadRow[];
}
