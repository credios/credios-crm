import { desc, eq } from "drizzle-orm";

import { leadDocumentos, leads as leadsTable } from "../../../../db/schema";
import type { DocsPorTipo } from "@/components/portal/portal-client";
import { PortalInvalido } from "@/components/portal/portal-invalido";
import { PortalShell } from "@/components/portal/portal-shell";
import { VipClient } from "@/components/portal/vip-client";
import { db } from "@/lib/db";
import { estadoCivilVipFromCrm } from "@/lib/portal/checklist-vip";
import { resolvePortalToken } from "@/lib/portal/token";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sua operação · Credios",
  robots: { index: false, follow: false },
};

// Portal VIP: mesma autenticação por token do portal padrão (/portal/[token]),
// mesma tabela de documentos — o que muda é a curadoria (checklist de
// empresário, fixa) e a moldura (copy mínima + complementos com autosave).
// Rota separada pra não arriscar o fluxo dos outros leads.

type Props = { params: Promise<{ token: string }> };

function brl(centavos: number | null): string {
  if (!centavos) return "";
  return "R$ " + Math.round(centavos / 100).toLocaleString("pt-BR");
}

/** E.164 (+5521999998888) → (21) 99999-8888 pro input. */
function foneDisplay(e164: string | null): string {
  const d = (e164 ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return "";
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default async function VipPage({ params }: Props) {
  const { token } = await params;
  const leadId = await resolvePortalToken(token);
  if (!leadId) return <PortalInvalido />;

  const [lead] = await db
    .select({
      nome: leadsTable.nome,
      estadoCivil: leadsTable.estadoCivil,
      valorImovelCentavos: leadsTable.valorImovelCentavos,
      valorCreditoCentavos: leadsTable.valorCreditoCentavos,
      conjugeNome: leadsTable.conjugeNome,
      conjugeEmail: leadsTable.conjugeEmail,
      conjugeWhatsapp: leadsTable.conjugeWhatsapp,
    })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);
  if (!lead) return <PortalInvalido />;

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

  return (
    <PortalShell>
      <VipClient
        token={token}
        firstName={lead.nome.trim().split(/\s+/)[0] || lead.nome}
        initialEstadoCivil={estadoCivilVipFromCrm(lead.estadoCivil)}
        initialDocs={docsPorTipo}
        valores={{
          valorImovel: brl(lead.valorImovelCentavos),
          valorCredito: brl(lead.valorCreditoCentavos),
        }}
        conjuge={{
          nome: lead.conjugeNome ?? "",
          email: lead.conjugeEmail ?? "",
          whatsapp: foneDisplay(lead.conjugeWhatsapp),
        }}
      />
    </PortalShell>
  );
}
