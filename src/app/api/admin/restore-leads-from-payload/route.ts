import { isNotNull, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { leads as leadsTable } from "../../../../../db/schema";
import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import {
  emptyToNull,
  normalizarCpf,
  reaisParaCentavos,
} from "@/lib/validators/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Restauração de campos apagados pelo bug do PATCH /api/leads/[id] (corrigido
 * em 2026-05-06). O bug aparecia quando o consultor editava QUALQUER seção
 * do lead pela UI: o servidor zerava todos os campos não-enviados e mudava
 * a origem pra "Manual" — efeito do `optionalString.nullish().transform()` +
 * `origem.default("Manual")` em `createLeadSchema.partial()`.
 *
 * Este endpoint usa o `rawPayload` (corpo original do webhook, preservado em
 * leads.raw_payload) pra restaurar campos canônicos que estão NULL agora mas
 * tinham valor no payload original. É ADITIVO: nunca sobrescreve campo que
 * já tem valor — só preenche os NULLs.
 *
 * Operação:
 *   GET  /api/admin/restore-leads-from-payload          → dry-run global
 *        /api/admin/restore-leads-from-payload?id=UUID  → dry-run de um lead
 *   POST /api/admin/restore-leads-from-payload          → aplica em todos
 *        /api/admin/restore-leads-from-payload?id=UUID  → aplica num só lead
 *
 * Resposta sempre traz `proposed[]` com diff (chave → from / to). No POST,
 * `applied` retorna a contagem de leads efetivamente atualizados.
 */

type LeadRow = typeof leadsTable.$inferSelect;

/** Campos canônicos do lead que mapeiam 1-pra-1 com o payload do webhook. */
type RestorableField =
  | "cpf"
  | "estadoCivil"
  | "ocupacao"
  | "rendaMensalCentavos"
  | "email"
  | "cidade"
  | "estado"
  | "objetivoCredito"
  | "tipoImovel"
  | "tipoImovelDetalhes"
  | "situacaoImovel"
  | "tipoPessoa"
  | "valorImovelCentavos"
  | "saldoDevedorCentavos"
  | "valorCreditoCentavos"
  | "origem"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "utmTerm"
  | "utmContent"
  | "gclid"
  | "fbclid"
  | "msclkid"
  | "ttclid"
  | "wbraid"
  | "gbraid"
  | "rede"
  | "dispositivo"
  | "palavraChave"
  | "grupoAnuncios"
  | "criativo"
  | "tipoCorrespondencia"
  | "referrer"
  | "paginaEntrada";

/**
 * Mapeia a chave snake_case do payload pro valor canônico no formato esperado
 * pela coluna do banco. Retorna `null` se o payload não tem o campo (ou tem
 * vazio) — nesses casos a restauração não toca o lead.
 */
function buildRestoreCandidate(
  rawPayload: unknown,
): Partial<Record<RestorableField, string | number | null>> {
  if (!rawPayload || typeof rawPayload !== "object") return {};
  const p = rawPayload as Record<string, unknown>;
  const str = (k: string): string | null =>
    typeof p[k] === "string" ? emptyToNull(p[k] as string) : null;
  const num = (k: string): number | null =>
    typeof p[k] === "number"
      ? reaisParaCentavos(p[k] as number)
      : null;

  return {
    cpf: typeof p.cpf === "string" ? normalizarCpf(p.cpf) : null,
    estadoCivil: str("estado_civil"),
    ocupacao: str("ocupacao"),
    rendaMensalCentavos: num("renda_mensal"),
    email:
      typeof p.email === "string" && p.email.trim()
        ? p.email.trim().toLowerCase()
        : null,
    cidade: str("cidade"),
    estado:
      typeof p.estado === "string" && p.estado.trim()
        ? p.estado.trim().toUpperCase().slice(0, 2)
        : null,
    objetivoCredito: str("objetivo_credito"),
    tipoImovel: str("tipo_imovel"),
    tipoImovelDetalhes: str("tipo_imovel_detalhes"),
    situacaoImovel: str("situacao_imovel"),
    tipoPessoa: str("tipo_pessoa"),
    valorImovelCentavos: num("valor_imovel"),
    saldoDevedorCentavos: num("saldo_devedor"),
    valorCreditoCentavos: num("valor_credito"),
    origem: str("origem"),
    utmSource: str("utm_source"),
    utmMedium: str("utm_medium"),
    utmCampaign: str("utm_campaign"),
    utmTerm: str("utm_term"),
    utmContent: str("utm_content"),
    gclid: str("gclid"),
    fbclid: str("fbclid"),
    msclkid: str("msclkid"),
    ttclid: str("ttclid"),
    wbraid: str("wbraid"),
    gbraid: str("gbraid"),
    rede: str("rede"),
    dispositivo: str("dispositivo"),
    palavraChave: str("palavra_chave"),
    grupoAnuncios: str("grupo_anuncios"),
    criativo: str("criativo"),
    tipoCorrespondencia: str("tipo_correspondencia"),
    referrer: str("referrer"),
    paginaEntrada: str("pagina_entrada"),
  };
}

type DiffEntry = {
  field: RestorableField;
  from: string | number | null;
  to: string | number | null;
};

type LeadDiff = {
  leadId: string;
  nome: string;
  origemAtual: string | null;
  changes: DiffEntry[];
};

/**
 * Compara `lead` (estado atual) com `candidate` (do payload). Devolve só os
 * campos onde o lead tem `null` E o candidate tem valor — restauração ADITIVA.
 *
 * Caso especial pra `whatsapp`: se o normalizado do payload bate com o
 * whatsapp atual, ignoramos. O bug zerou outros campos mas o whatsapp era
 * sempre o que o consultor estava editando, então não toca aqui.
 *
 * Caso especial pra `nome`: também não toca — nome nunca foi zerado pelo bug
 * (no PATCH, nome só vai pro updates se patch.nome != null, então o bug
 * preservava nome).
 */
function diffLeadVsPayload(
  lead: LeadRow,
  candidate: Partial<Record<RestorableField, string | number | null>>,
): DiffEntry[] {
  const changes: DiffEntry[] = [];
  const currentByField: Record<RestorableField, string | number | null> = {
    cpf: lead.cpf,
    estadoCivil: lead.estadoCivil,
    ocupacao: lead.ocupacao,
    rendaMensalCentavos: lead.rendaMensalCentavos,
    email: lead.email,
    cidade: lead.cidade,
    estado: lead.estado,
    objetivoCredito: lead.objetivoCredito,
    tipoImovel: lead.tipoImovel,
    tipoImovelDetalhes: lead.tipoImovelDetalhes,
    situacaoImovel: lead.situacaoImovel,
    tipoPessoa: lead.tipoPessoa,
    valorImovelCentavos: lead.valorImovelCentavos,
    saldoDevedorCentavos: lead.saldoDevedorCentavos,
    valorCreditoCentavos: lead.valorCreditoCentavos,
    // Origem é caso especial: o bug troca pra "Manual". Se o atual é
    // "Manual" e o payload tinha algo diferente, restauramos.
    origem: lead.origem,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    utmTerm: lead.utmTerm,
    utmContent: lead.utmContent,
    gclid: lead.gclid,
    fbclid: lead.fbclid,
    msclkid: lead.msclkid,
    ttclid: lead.ttclid,
    wbraid: lead.wbraid,
    gbraid: lead.gbraid,
    rede: lead.rede,
    dispositivo: lead.dispositivo,
    palavraChave: lead.palavraChave,
    grupoAnuncios: lead.grupoAnuncios,
    criativo: lead.criativo,
    tipoCorrespondencia: lead.tipoCorrespondencia,
    referrer: lead.referrer,
    paginaEntrada: lead.paginaEntrada,
  };

  for (const [field, payloadVal] of Object.entries(candidate) as Array<
    [RestorableField, string | number | null]
  >) {
    if (payloadVal == null) continue;
    const current = currentByField[field];

    // Origem tem regra especial: substituir "Manual" pelo valor original.
    // Pros demais campos, só restauramos quando o atual é null.
    if (field === "origem") {
      if (current == null || current === "Manual") {
        if (payloadVal !== current) {
          changes.push({ field, from: current, to: payloadVal });
        }
      }
      continue;
    }

    if (current == null) {
      changes.push({ field, from: null, to: payloadVal });
    }
  }

  return changes;
}

/** Aplica os diffs no lead via UPDATE Drizzle. */
async function applyDiff(leadId: string, changes: DiffEntry[]): Promise<void> {
  if (changes.length === 0) return;
  const updates: Record<string, unknown> = {};
  for (const c of changes) {
    if (c.field === "cpf" && typeof c.to === "string") {
      updates[c.field] = normalizarCpf(c.to);
    } else if (c.field === "estado" && typeof c.to === "string") {
      updates[c.field] = c.to.toUpperCase().slice(0, 2);
    } else {
      updates[c.field] = c.to;
    }
  }
  await db.update(leadsTable).set(updates).where(eq(leadsTable.id, leadId));
}

async function buildResponse(filterId: string | null) {
  const baseQuery = db
    .select()
    .from(leadsTable)
    .where(
      filterId
        ? eq(leadsTable.id, filterId)
        : isNotNull(leadsTable.rawPayload),
    );
  const rows = await baseQuery;
  const proposed: LeadDiff[] = [];
  for (const lead of rows) {
    if (!lead.rawPayload) continue;
    const candidate = buildRestoreCandidate(lead.rawPayload);
    const diff = diffLeadVsPayload(lead, candidate);
    if (diff.length === 0) continue;
    proposed.push({
      leadId: lead.id,
      nome: lead.nome,
      origemAtual: lead.origem,
      changes: diff,
    });
  }
  return proposed;
}

export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const proposed = await buildResponse(id);

  return NextResponse.json({
    mode: "dry-run",
    totalLeadsAffected: proposed.length,
    totalFieldsToRestore: proposed.reduce((acc, p) => acc + p.changes.length, 0),
    proposed,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const proposed = await buildResponse(id);

  let appliedLeads = 0;
  let appliedFields = 0;
  for (const p of proposed) {
    // Re-checa o estado atual antes de aplicar (paranoia — entre o build
    // do diff e o UPDATE, alguém poderia ter editado). Pega o lead de novo,
    // recalcula o diff, e aplica só o que continua válido.
    const [fresh] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, p.leadId))
      .limit(1);
    if (!fresh || !fresh.rawPayload) continue;

    const candidate = buildRestoreCandidate(fresh.rawPayload);
    const stillValid = diffLeadVsPayload(fresh, candidate);
    if (stillValid.length === 0) continue;

    await applyDiff(p.leadId, stillValid);
    appliedLeads += 1;
    appliedFields += stillValid.length;

    await logAction(
      null,
      user.id,
      "lead_editado",
      "lead",
      p.leadId,
      {
        source: "restore-from-payload",
        fields: stillValid.map((c) => c.field),
      },
      extractRequestMeta(request),
    );
  }

  return NextResponse.json({
    mode: "applied",
    appliedLeads,
    appliedFields,
    // Bug fix: também force a contagem da query inicial pra UI ter algum
    // feedback se nada foi aplicado.
    candidatesEvaluated: proposed.length,
    proposed,
  });
}
