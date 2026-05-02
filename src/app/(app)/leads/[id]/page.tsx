import { and, asc, eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import {
  interacoes,
  leads as leadsTable,
  mensagensTemplate,
  users as usersTable,
} from "../../../../../db/schema";
import { LeadDetailHeader } from "@/components/leads/lead-detail-header";
import {
  type LeadDetailData,
  LeadContatoCard,
  LeadOperacaoCard,
  LeadOrigemCard,
  LeadPessoaisCard,
} from "@/components/leads/lead-detail-sections";
import { LeadTimeline } from "@/components/leads/lead-timeline";
import { MensagensSugeridas } from "@/components/leads/mensagens-sugeridas";
import { getAppUser } from "@/lib/auth/get-app-user";
import { maskLeadForPerfil } from "@/lib/auth/mascaramento";
import { checkPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { listConsultoresAtivos } from "@/lib/leads/list-leads";

type Props = { params: Promise<{ id: string }> };

export default async function LeadDetailPage({ params }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const [row] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!row) notFound();

  if (
    !checkPermission(user, "lead.read", { type: "lead", consultorId: row.consultorId })
  ) {
    redirect("/sem-permissao");
  }

  const masked = maskLeadForPerfil(row, user.perfil);

  const [consultorRow] = row.consultorId
    ? await db
        .select({ nome: usersTable.nome })
        .from(usersTable)
        .where(eq(usersTable.id, row.consultorId))
        .limit(1)
    : [];

  const [interacoesRows, templatesRows, consultores] = await Promise.all([
    db
      .select({
        id: interacoes.id,
        tipo: interacoes.tipo,
        conteudo: interacoes.conteudo,
        metadata: interacoes.metadata,
        criadoEm: interacoes.criadoEm,
        autorId: interacoes.autorId,
        autorNome: usersTable.nome,
      })
      .from(interacoes)
      .leftJoin(usersTable, eq(usersTable.id, interacoes.autorId))
      .where(eq(interacoes.leadId, id))
      .orderBy(asc(interacoes.criadoEm)),
    db
      .select()
      .from(mensagensTemplate)
      .where(
        and(
          eq(mensagensTemplate.ativa, true),
          sql`${mensagensTemplate.statusAplicavel} @> ARRAY[${row.status}]::status_lead[]`,
        ),
      )
      .orderBy(mensagensTemplate.ordem),
    listConsultoresAtivos(),
  ]);

  const lead: LeadDetailData = {
    id: row.id,
    nome: masked.nome,
    cpf: masked.cpf,
    estadoCivil: masked.estadoCivil,
    ocupacao: masked.ocupacao,
    rendaMensalCentavos: masked.rendaMensalCentavos,
    whatsapp: masked.whatsapp,
    email: masked.email,
    cidade: masked.cidade,
    estado: masked.estado,
    produto: masked.produto,
    objetivoCredito: masked.objetivoCredito,
    tipoImovel: masked.tipoImovel,
    situacaoImovel: masked.situacaoImovel,
    tipoPessoa: masked.tipoPessoa,
    valorImovelCentavos: masked.valorImovelCentavos,
    valorCreditoCentavos: masked.valorCreditoCentavos,
    bancoAprovador: masked.bancoAprovador ?? null,
    valorLiberadoCentavos: masked.valorLiberadoCentavos ?? null,
    comissaoCentavos: masked.comissaoCentavos ?? null,
    dataFechamento: masked.dataFechamento,
    origem: masked.origem,
    utmSource: masked.utmSource,
    utmMedium: masked.utmMedium,
    utmCampaign: masked.utmCampaign,
    utmTerm: masked.utmTerm,
    utmContent: masked.utmContent,
    gclid: masked.gclid,
    rede: masked.rede,
    dispositivo: masked.dispositivo,
    palavraChave: masked.palavraChave,
    grupoAnuncios: masked.grupoAnuncios,
    criativo: masked.criativo,
    tipoCorrespondencia: masked.tipoCorrespondencia,
    referrer: masked.referrer,
    paginaEntrada: masked.paginaEntrada,
  };

  const canEdit = checkPermission(user, "lead.update", {
    type: "lead",
    consultorId: row.consultorId,
  });
  const canAssign = checkPermission(user, "lead.assign");
  const canCreateInteracao = checkPermission(user, "interacao.create", {
    type: "lead",
    consultorId: row.consultorId,
  });

  const interacoesSerializadas = interacoesRows.map((i) => ({
    id: i.id,
    tipo: i.tipo,
    conteudo: i.conteudo,
    metadata: i.metadata,
    criadoEm: i.criadoEm.toISOString(),
    autorId: i.autorId,
    autorNome: i.autorNome,
  }));

  return (
    <div className="space-y-6">
      <LeadDetailHeader
        lead={{
          id: lead.id,
          nome: lead.nome,
          status: row.status,
          valorCreditoCentavos: lead.valorCreditoCentavos,
          whatsapp: lead.whatsapp,
          email: lead.email,
        }}
        canEdit={canEdit}
        canAssign={canAssign}
        isAdmin={user.perfil === "admin"}
        consultores={consultores}
      />

      {row.consultorId && consultorRow && (
        <p className="text-sm text-muted-foreground">
          Atribuído a <span className="font-medium text-foreground">{consultorRow.nome}</span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <LeadPessoaisCard lead={lead} canEdit={canEdit} />
          <LeadContatoCard lead={lead} canEdit={canEdit} />
          <LeadOperacaoCard lead={lead} canEdit={canEdit} />
          <LeadOrigemCard lead={lead} />
          <MensagensSugeridas
            templates={templatesRows.map((t) => ({
              id: t.id,
              nome: t.nome,
              ordem: t.ordem,
              conteudo: t.conteudo,
              statusAplicavel: t.statusAplicavel,
            }))}
            lead={{
              nome: lead.nome,
              cidade: lead.cidade,
              estado: lead.estado,
              valorCreditoCentavos: lead.valorCreditoCentavos,
              valorImovelCentavos: lead.valorImovelCentavos,
            }}
          />
        </div>
        <div>
          <LeadTimeline
            leadId={lead.id}
            initial={interacoesSerializadas}
            canCreate={canCreateInteracao}
          />
        </div>
      </div>
    </div>
  );
}
