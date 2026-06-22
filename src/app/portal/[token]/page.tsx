import { desc, eq } from "drizzle-orm";

import { leadDocumentos, leads as leadsTable } from "../../../../db/schema";
import { PortalClient, type DocsPorTipo } from "@/components/portal/portal-client";
import { PortalInvalido } from "@/components/portal/portal-invalido";
import { PortalShell } from "@/components/portal/portal-shell";
import { db } from "@/lib/db";
import { buildChecklist } from "@/lib/portal/checklist";
import { resolvePortalToken } from "@/lib/portal/token";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Seus documentos · Credios",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function PortalPage({ params }: Props) {
  const { token } = await params;
  const leadId = await resolvePortalToken(token);

  if (!leadId) {
    return <PortalInvalido />;
  }

  const [lead] = await db
    .select({
      nome: leadsTable.nome,
      estadoCivil: leadsTable.estadoCivil,
      ocupacao: leadsTable.ocupacao,
      tipoPessoa: leadsTable.tipoPessoa,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      situacaoImovel: leadsTable.situacaoImovel,
      conjugeEmail: leadsTable.conjugeEmail,
      conjugeWhatsapp: leadsTable.conjugeWhatsapp,
      conjugeCompoeRenda: leadsTable.conjugeCompoeRenda,
      conjugeOcupacao: leadsTable.conjugeOcupacao,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);

  if (!lead) {
    return <PortalInvalido />;
  }

  const sections = buildChecklist(lead);

  const docs = await db
    .select({
      id: leadDocumentos.id,
      tipo: leadDocumentos.tipo,
      filenameOriginal: leadDocumentos.filenameOriginal,
      tamanhoBytes: leadDocumentos.tamanhoBytes,
    })
    .from(leadDocumentos)
    .where(eq(leadDocumentos.leadId, leadId))
    .orderBy(desc(leadDocumentos.createdAt));

  const docsPorTipo: DocsPorTipo = {};
  for (const d of docs) {
    (docsPorTipo[d.tipo] ??= []).push({
      id: d.id,
      filename: d.filenameOriginal ?? "documento",
      tamanhoBytes: d.tamanhoBytes ?? 0,
    });
  }

  const firstName = lead.nome.trim().split(/\s+/)[0] || lead.nome;

  // Casado/união estável que ainda NÃO respondeu se o cônjuge compõe renda
  // (pulou a última etapa do simulador) → o portal pergunta.
  const isCasadoUniao =
    lead.estadoCivil === "Casado(a)" || lead.estadoCivil === "União Estável";
  const perguntarConjugeRenda = isCasadoUniao && lead.conjugeCompoeRenda == null;

  return (
    <PortalShell>
      <PortalClient
        token={token}
        firstName={firstName}
        sections={sections}
        initialDocs={docsPorTipo}
        perguntarConjugeRenda={perguntarConjugeRenda}
      />
    </PortalShell>
  );
}
