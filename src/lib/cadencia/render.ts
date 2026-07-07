import "server-only";

import { eq } from "drizzle-orm";

import { mensagensTemplate } from "../../../db/schema";
import { gerarAgendaToken } from "@/lib/agenda/token";
import { db } from "@/lib/db";
import { generatePortalToken, portalUrl } from "@/lib/portal/token";
import { renderTemplate } from "@/lib/templates";
import type { PassoCadencia } from "@/lib/cadencia/config";

// Prepara a mensagem PRONTA de um passo da cadência: template do playbook +
// variáveis do lead + links por lead ({{link_agenda}} → página pública de
// agendamento do CRM; {{link_docs}} → portal de documentos). Tokens só são
// gerados quando o template realmente usa o placeholder (o de docs cria linha
// no banco — não gerar à toa).

type LeadRender = {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  valorCreditoCentavos: number | null;
  valorImovelCentavos: number | null;
};

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export async function prepararMensagemPasso(
  lead: LeadRender,
  passo: PassoCadencia,
  consultorNome: string | null,
): Promise<string | null> {
  if (passo.tipo !== "mensagem" || !passo.templateId) return null;
  const [tpl] = await db
    .select({ conteudo: mensagensTemplate.conteudo })
    .from(mensagensTemplate)
    .where(eq(mensagensTemplate.id, passo.templateId))
    .limit(1);
  if (!tpl) return null;

  const links: { agenda?: string; docs?: string } = {};
  if (tpl.conteudo.includes("{{link_agenda}}")) {
    links.agenda = `${baseUrl()}/agendar/${gerarAgendaToken(lead.id)}`;
  }
  if (tpl.conteudo.includes("{{link_docs}}")) {
    const { token } = await generatePortalToken(lead.id);
    const u = portalUrl(token);
    if (u.startsWith("http")) links.docs = u;
  }

  return renderTemplate(
    tpl.conteudo,
    {
      nome: lead.nome,
      cidade: lead.cidade,
      estado: lead.estado,
      valorCreditoCentavos: lead.valorCreditoCentavos,
      valorImovelCentavos: lead.valorImovelCentavos,
      consultor: consultorNome,
    },
    links,
  );
}
