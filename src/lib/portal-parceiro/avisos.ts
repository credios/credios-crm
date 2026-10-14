import { and, eq, sql } from "drizzle-orm";

import { parceiroInteracoes, parceiroUsuarios, parceiros } from "../../../db/schema";
import { db } from "@/lib/db";

import { sendEtapaIndicacaoEmail } from "./email";
import { etapaDoStatus, type Etapa } from "./status";

// Aviso por e-mail ao parceiro quando uma indicação dele chega numa etapa que
// importa. Decisão do owner (2026-10-13): só análise de crédito, liberada e
// não aprovada — as demais são ruído.

const ETAPAS_AVISADAS: Etapa[] = ["em_credito", "liberada", "nao_aprovada"];

type LeadDoAviso = { id: string; nome: string; parceiroId: string | null };

export async function avisarParceiroDaEtapa(lead: LeadDoAviso, novoStatus: string): Promise<void> {
  if (!lead.parceiroId) return;
  const etapa = etapaDoStatus(novoStatus);
  if (!ETAPAS_AVISADAS.includes(etapa)) return;

  // Só quem tem login ativo no portal — o e-mail leva pro acompanhamento lá.
  const [dest] = await db
    .select({ nome: parceiroUsuarios.nome, email: parceiroUsuarios.email })
    .from(parceiroUsuarios)
    .innerJoin(parceiros, eq(parceiros.id, parceiroUsuarios.parceiroId))
    .where(and(eq(parceiros.id, lead.parceiroId), eq(parceiros.portalAcesso, "ativo")))
    .limit(1);
  if (!dest) return;

  // Um aviso por (indicação, etapa): vários status internos caem na mesma
  // etapa pública, e status pode ir e voltar.
  const [ja] = await db
    .select({ id: parceiroInteracoes.id })
    .from(parceiroInteracoes)
    .where(
      and(
        eq(parceiroInteracoes.parceiroId, lead.parceiroId),
        sql`${parceiroInteracoes.metadata} ->> 'kind' = 'aviso_etapa'`,
        sql`${parceiroInteracoes.metadata} ->> 'leadId' = ${lead.id}`,
        sql`${parceiroInteracoes.metadata} ->> 'etapa' = ${etapa}`,
      ),
    )
    .limit(1);
  if (ja) return;

  const envio = await sendEtapaIndicacaoEmail({
    nome: dest.nome,
    email: dest.email,
    clienteNome: lead.nome,
    leadId: lead.id,
    etapa,
  });
  if (!envio.ok) return; // não registra: a próxima mudança tenta de novo
  await db.insert(parceiroInteracoes).values({
    parceiroId: lead.parceiroId,
    autorId: null,
    tipo: "evento_sistema",
    conteudo: `Parceiro avisado por e-mail: indicação de ${lead.nome} em "${etapa}".`,
    metadata: { kind: "aviso_etapa", leadId: lead.id, etapa },
  });
}
