/**
 * Import de leads ATIVOS do Notion para o CRM.
 *
 * Lê arquivos .md exportados do Notion, parseia properties + body,
 * filtra (status não-terminal + atribuído a Gabriel ou Rodrigo) e
 * inserta no banco com idempotência via `notion_id`.
 *
 * Uso:
 *   npx tsx db/import-notion.ts <export-dir> [--apply]
 *
 *   Sem --apply: DRY-RUN (mostra tabela do que entraria, sem inserir).
 *   Com --apply: executa o INSERT (UPSERT por notion_id).
 *
 * Exemplo:
 *   npx tsx db/import-notion.ts \
 *     "/Users/gabrielmeirelles/Downloads/ExportBlock-..." --apply
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { interacoes, leads as leadsTable } from "./schema";

// ============================================================================
// Configuração de mapping
// ============================================================================

const CONSULTOR_BY_NOTION: Record<string, string> = {
  // Notion "Pessoa" → user.id no CRM
  "Gabriel Meirelles": "d239a8a0-64bb-4969-8ce5-fc3fc9afbdd3", // admin
  "Rodrigo Audi": "697810d6-834f-4c6a-a85d-b88f236947f7",
  "Rodrigo": "697810d6-834f-4c6a-a85d-b88f236947f7", // alias
};

const STATUS_BY_NOTION: Record<string, string> = {
  // Importáveis (não-terminais)
  Novo: "novo",
  "Conversa Inicial": "conversa_inicial",
  "Aguardando Resposta": "aguardando_resposta",
  "Aguardando Documentação": "aguardando_documentacao",
  "Em Negociação": "em_negociacao",
  Qualificado: "conversa_inicial", // opção B do user
  // Terminais (NÃO importar — listados pra log informativo)
  Fechado: "__SKIP__",
  Desqualificado: "__SKIP__",
  Perdido: "__SKIP__",
  "Sem Resposta": "__SKIP__",
};

const UF_BY_ESTADO_NOME: Record<string, string> = {
  Acre: "AC", Alagoas: "AL", Amapá: "AP", Amazonas: "AM", Bahia: "BA",
  Ceará: "CE", "Distrito Federal": "DF", "Espírito Santo": "ES", Goiás: "GO",
  Maranhão: "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG", Pará: "PA", Paraíba: "PB", Paraná: "PR",
  Pernambuco: "PE", Piauí: "PI", "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", Rondônia: "RO",
  Roraima: "RR", "Santa Catarina": "SC", "São Paulo": "SP", Sergipe: "SE",
  Tocantins: "TO",
};

// ============================================================================
// Parser de .md exportado do Notion
// ============================================================================

type ParsedLead = {
  notionId: string;
  filename: string;

  // Header properties
  nome: string | null;
  pessoa: string | null;
  status: string | null;
  origem: string | null;
  telefone: string | null;
  email: string | null;
  chegouEm: string | null;
  campanha: string | null;
  criativo: string | null;
  dispositivo: string | null;
  gclid: string | null;
  grupoAnuncios: string | null;
  midia: string | null;
  palavraChave: string | null;
  rede: string | null;
  tipoCorrespondencia: string | null;
  valorBuscadoCsv: string | null;

  // Body fields
  cpf: string | null;
  estadoCivil: string | null;
  ocupacao: string | null;
  rendaMensal: string | null;
  whatsapp: string | null;
  cidadeEstado: string | null;
  tipoProduto: string | null;
  objetivoCredito: string | null;
  tipoImovel: string | null;
  situacaoImovel: string | null;
  tipoPessoa: string | null;
  valorImovel: string | null;
  valorCreditoBuscado: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  landingUrl: string | null;
  referrer: string | null;
  referrerUrl: string | null;
};

/**
 * Extrai UUID Notion do nome do arquivo (32 chars hex no fim, antes do .md).
 * Ex: "Vydima ... 352d17b1f9ae8118bb18e6949564bf1c.md" → "352d17b1f9ae8118bb18e6949564bf1c"
 */
function extractNotionId(filename: string): string | null {
  const m = filename.match(/([0-9a-f]{32})\.md$/i);
  return m?.[1] ?? null;
}

/** Pega valor depois de "Campo: " no header (uma linha). */
function getHeaderField(content: string, label: string): string | null {
  const re = new RegExp(`^${escapeRe(label)}:\\s*(.+)$`, "m");
  return content.match(re)?.[1]?.trim() ?? null;
}

/** Pega valor de "- **Campo:** valor" ou "**Campo:** valor" no body. */
function getBodyField(content: string, label: string): string | null {
  const re = new RegExp(
    `\\*\\*${escapeRe(label)}:\\*\\*\\s*(.+?)(?:\\n|$)`,
    "i",
  );
  return content.match(re)?.[1]?.trim() ?? null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLeadFile(filepath: string): ParsedLead | null {
  const content = readFileSync(filepath, "utf-8");
  const filename = basename(filepath);
  const notionId = extractNotionId(filename);
  if (!notionId) return null;

  // Nome vem do título "# Nome" — limpa prefixo [GADS] se houver.
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const titleRaw = titleMatch?.[1]?.trim() ?? null;
  const nome = titleRaw?.replace(/^\[GADS\]\s*/i, "")?.trim() ?? null;

  return {
    notionId,
    filename,
    nome,
    pessoa: getHeaderField(content, "Pessoa"),
    status: getHeaderField(content, "Status"),
    origem: getHeaderField(content, "Origem"),
    telefone: getHeaderField(content, "Telefone"),
    email: getHeaderField(content, "Email"),
    chegouEm: getHeaderField(content, "Chegou em"),
    campanha: getHeaderField(content, "Campanha"),
    criativo: getHeaderField(content, "Criativo"),
    dispositivo: getHeaderField(content, "Dispositivo"),
    gclid: getHeaderField(content, "GCLID"),
    grupoAnuncios: getHeaderField(content, "Grupo de Anúncios"),
    midia: getHeaderField(content, "Mídia"),
    palavraChave: getHeaderField(content, "Palavra-chave"),
    rede: getHeaderField(content, "Rede"),
    tipoCorrespondencia: getHeaderField(content, "Tipo de Correspondência"),
    valorBuscadoCsv: getHeaderField(content, "Valor Buscado (R$)"),
    cpf: getBodyField(content, "CPF"),
    estadoCivil: getBodyField(content, "Estado Civil"),
    ocupacao: getBodyField(content, "Ocupação"),
    rendaMensal: getBodyField(content, "Renda Mensal"),
    whatsapp: getBodyField(content, "WhatsApp"),
    cidadeEstado: getBodyField(content, "Cidade/Estado"),
    tipoProduto: getBodyField(content, "Tipo de Produto"),
    objetivoCredito: getBodyField(content, "Objetivo do Crédito"),
    tipoImovel: getBodyField(content, "Tipo de Imóvel"),
    situacaoImovel: getBodyField(content, "Situação do Imóvel"),
    tipoPessoa: getBodyField(content, "Pessoa"),
    valorImovel: getBodyField(content, "Valor do Imóvel"),
    valorCreditoBuscado: getBodyField(content, "Valor de Crédito Buscado"),
    utmSource: getBodyField(content, "utm_source"),
    utmMedium: getBodyField(content, "utm_medium"),
    utmCampaign: getBodyField(content, "utm_campaign"),
    utmTerm: getBodyField(content, "utm_term"),
    utmContent: getBodyField(content, "utm_content"),
    landingUrl: getBodyField(content, "Landing URL"),
    referrer: getBodyField(content, "Referrer"),
    referrerUrl: getBodyField(content, "Referrer (URL)"),
  };
}

// ============================================================================
// Normalizadores
// ============================================================================

/** "R$ 9.500" / "R$ 200.000,00" / "R$ 540.000" → centavos */
function parseBrlToCents(raw: string | null): number | null {
  if (!raw) return null;
  // Remove "R$", espaços, separadores de milhar, troca vírgula decimal por ponto.
  const cleaned = raw
    .replace(/R\$/i, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** "+5579996937950" / "(79) 99693-7950" → "+5579996937950" */
function normalizeWhatsapp(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}

/** "012.093.745-01" / "01209374501" → "012.093.745-01" */
function normalizeCpf(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return raw; // não força — pode ser CNPJ ou inválido
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** "Barra dos Coqueiros, Sergipe" → { cidade: "Barra dos Coqueiros", estadoUf: "SE" } */
function parseCidadeEstado(raw: string | null): {
  cidade: string | null;
  estadoUf: string | null;
} {
  if (!raw) return { cidade: null, estadoUf: null };
  const parts = raw.split(",").map((s) => s.trim());
  const cidade = parts[0] || null;
  const estadoNome = parts[1] || null;
  if (!estadoNome) return { cidade, estadoUf: null };
  // Aceita já como UF (2 letras) ou nome completo
  if (estadoNome.length === 2) return { cidade, estadoUf: estadoNome.toUpperCase() };
  return { cidade, estadoUf: UF_BY_ESTADO_NOME[estadoNome] ?? null };
}

/** "✅ Quitado" → "Quitado". "Em Inventário" → "Em Inventário". */
function cleanEmoji(raw: string | null): string | null {
  if (!raw) return null;
  // Remove emoji + espaços do início
  return raw.replace(/^[^\w\sÀ-ÿ]+\s*/u, "").trim() || null;
}

/** "30 de abril de 2026 08:29" → Date (BRT, UTC-3 fixo) */
function parseNotionDate(raw: string | null): Date | null {
  if (!raw) return null;
  const months: Record<string, number> = {
    janeiro: 0, fevereiro: 1, março: 2, abril: 3, maio: 4, junho: 5,
    julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  };
  const m = raw
    .toLowerCase()
    .match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, day, mes, year, hour, minute] = m;
  const monthIdx = months[mes!];
  if (monthIdx === undefined) return null;
  // Constrói como BRT (UTC-3): adiciona 3h pra equivaler em UTC
  const utcMs = Date.UTC(
    Number(year),
    monthIdx,
    Number(day),
    Number(hour) + 3, // BRT → UTC
    Number(minute),
  );
  return new Date(utcMs);
}

/** "Empréstimo com Garantia de Imóvel" → "CGI" */
function mapProduto(raw: string | null): string {
  if (!raw) return "CGI";
  if (/garantia\s+de\s+im[oó]vel/i.test(raw)) return "CGI";
  if (/financiamento/i.test(raw)) return "Financiamento";
  if (/cond[oó]m[ií]nio/i.test(raw)) return "Condomínio";
  return "CGI";
}

// ============================================================================
// Pipeline
// ============================================================================

type PreparedRow = {
  notionId: string;
  filename: string;
  reason?: string; // motivo de skip se aplicável
  payload?: Record<string, unknown>;
  consultorId?: string | null; // null = pool não-atribuído
  consultorNomeNotion?: string;
  statusOriginal?: string;
  statusMapeado?: string;
};

function prepare(parsed: ParsedLead): PreparedRow {
  const { notionId, filename } = parsed;

  if (!parsed.nome) {
    return { notionId, filename, reason: "sem nome no título" };
  }
  if (!parsed.status) {
    return { notionId, filename, reason: "sem Status no Notion" };
  }
  const statusMapeado = STATUS_BY_NOTION[parsed.status];
  if (!statusMapeado) {
    return {
      notionId,
      filename,
      reason: `status desconhecido: "${parsed.status}"`,
    };
  }
  if (statusMapeado === "__SKIP__") {
    return {
      notionId,
      filename,
      reason: `terminal: "${parsed.status}"`,
      statusOriginal: parsed.status,
    };
  }

  // Sem Pessoa atribuída no Notion → importa pro pool não-atribuído
  // (consultor_id=null). Status mapeado é preservado pra admin decidir
  // reatribuição depois.
  let consultorId: string | null;
  if (!parsed.pessoa) {
    consultorId = null;
  } else {
    consultorId = CONSULTOR_BY_NOTION[parsed.pessoa] ?? null;
    if (!consultorId) {
      return {
        notionId,
        filename,
        reason: `consultor desconhecido: "${parsed.pessoa}"`,
      };
    }
  }

  const { cidade, estadoUf } = parseCidadeEstado(parsed.cidadeEstado);
  const whatsapp = normalizeWhatsapp(parsed.whatsapp ?? parsed.telefone);
  // PRIORIZA o header (`Valor Buscado (R$)`) sobre o body (`Valor de Crédito
  // Buscado`). O body vinha do formulário Wizard antigo que tinha bug de
  // formatação (multiplicava zeros em alguns casos — ex: DIEGO header R$ 200k
  // mas body R$ 200M). O header é a propriedade Notion canônica.
  let valorCreditoCentavos =
    parseBrlToCents(parsed.valorBuscadoCsv) ??
    parseBrlToCents(parsed.valorCreditoBuscado);
  let valorImovelCentavos = parseBrlToCents(parsed.valorImovel);
  // CGI raramente passa de R$ 5M. Valor >= R$ 10M é typo recorrente do
  // formulário antigo (cliente digita zeros a mais). Divide por 1000 pra
  // normalizar. Se mesmo assim ficar absurdo, fica pra revisão manual.
  const ZEROS_EXTRA_THRESHOLD = 10_000_000_00; // R$ 10M em centavos
  if (valorCreditoCentavos != null && valorCreditoCentavos >= ZEROS_EXTRA_THRESHOLD) {
    valorCreditoCentavos = Math.round(valorCreditoCentavos / 1000);
  }
  if (valorImovelCentavos != null && valorImovelCentavos >= ZEROS_EXTRA_THRESHOLD) {
    valorImovelCentavos = Math.round(valorImovelCentavos / 1000);
  }
  const rendaMensalCentavos = parseBrlToCents(parsed.rendaMensal);
  const chegouEmDate = parseNotionDate(parsed.chegouEm);

  const payload = {
    nome: parsed.nome,
    cpf: normalizeCpf(parsed.cpf),
    estadoCivil: parsed.estadoCivil,
    ocupacao: parsed.ocupacao,
    rendaMensalCentavos,
    whatsapp,
    email: parsed.email,
    cidade,
    estado: estadoUf,
    produto: mapProduto(parsed.tipoProduto),
    objetivoCredito: parsed.objetivoCredito,
    tipoImovel: parsed.tipoImovel,
    situacaoImovel: cleanEmoji(parsed.situacaoImovel),
    tipoPessoa: parsed.tipoPessoa,
    valorImovelCentavos,
    valorCreditoCentavos,
    status: statusMapeado,
    consultorId, // null = pool não-atribuído
    // atribuidoEm só faz sentido quando há consultor.
    atribuidoEm: consultorId ? (chegouEmDate ?? new Date()) : null,
    origem: parsed.origem,
    utmSource: parsed.utmSource,
    utmMedium: parsed.utmMedium ?? parsed.midia,
    utmCampaign: parsed.utmCampaign ?? parsed.campanha,
    utmTerm: parsed.utmTerm,
    utmContent: parsed.utmContent,
    gclid: parsed.gclid,
    rede: parsed.rede,
    dispositivo: parsed.dispositivo,
    palavraChave: parsed.palavraChave,
    grupoAnuncios: parsed.grupoAnuncios,
    criativo: parsed.criativo,
    tipoCorrespondencia: parsed.tipoCorrespondencia,
    referrer: parsed.referrer,
    paginaEntrada: parsed.landingUrl,
    notionId: parsed.notionId,
    createdAt: chegouEmDate ?? undefined, // preserva data original
  };

  return {
    notionId,
    filename,
    payload,
    consultorId,
    consultorNomeNotion: parsed.pessoa ?? undefined,
    statusOriginal: parsed.status,
    statusMapeado,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");

  if (!dir) {
    console.error("Uso: tsx db/import-notion.ts <export-dir> [--apply]");
    process.exit(1);
  }

  console.log(`📂 Lendo: ${dir}`);
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  console.log(`📄 ${files.length} arquivos .md encontrados`);

  const prepared: PreparedRow[] = [];
  for (const f of files) {
    const parsed = parseLeadFile(join(dir, f));
    if (!parsed) {
      console.log(`  ⊘ ${f} — não tem UUID Notion no nome, skip`);
      continue;
    }
    prepared.push(prepare(parsed));
  }

  const importable = prepared.filter((r) => r.payload);
  const skipped = prepared.filter((r) => !r.payload);

  // ===== Resumo =====
  console.log("\n" + "=".repeat(80));
  console.log(`📊 RESUMO`);
  console.log("=".repeat(80));
  console.log(`Total parseados:     ${prepared.length}`);
  console.log(`✅ Importáveis:      ${importable.length}`);
  console.log(`⊘  Skipped:          ${skipped.length}`);

  // Breakdown skips
  const skipReasons: Record<string, number> = {};
  for (const s of skipped) {
    const reason = s.reason ?? "desconhecido";
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  }
  console.log(`\nSkips por motivo:`);
  for (const [reason, n] of Object.entries(skipReasons).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${n.toString().padStart(3)} × ${reason}`);
  }

  // Breakdown importáveis por consultor + status
  const byConsultor: Record<string, Record<string, number>> = {};
  for (const r of importable) {
    const c = r.consultorNomeNotion ?? "?";
    const s = r.statusMapeado ?? "?";
    byConsultor[c] ??= {};
    byConsultor[c][s] = (byConsultor[c][s] ?? 0) + 1;
  }
  console.log(`\nImportáveis por consultor × status:`);
  for (const [c, statuses] of Object.entries(byConsultor)) {
    console.log(`  ${c}:`);
    for (const [s, n] of Object.entries(statuses).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${n.toString().padStart(3)} × ${s}`);
    }
  }

  // ===== Sanity check: valores absurdos pós-correção =====
  // Após a divisão por 1000 nos casos extremos, ainda pode sobrar coisa
  // estranha. Threshold conservador: > R$ 5M é raro mas possível em CGI.
  const VALOR_SUSPEITO_CENTAVOS = 5_000_000_00; // R$ 5M
  const suspeitos = importable.filter((r) => {
    const v = r.payload!.valorCreditoCentavos as number | null;
    return v != null && v >= VALOR_SUSPEITO_CENTAVOS;
  });
  if (suspeitos.length > 0) {
    console.log(`\n⚠ ${suspeitos.length} leads com valor crédito >= R$ 5M (revisar):`);
    for (const r of suspeitos) {
      const p = r.payload!;
      const v = ((p.valorCreditoCentavos as number) / 100).toLocaleString("pt-BR");
      console.log(`  ${String(p.nome).padEnd(40)} | R$ ${v}`);
    }
  }

  // ===== Tabela detalhada (primeiros 30) =====
  console.log(`\nPrimeiros ${Math.min(30, importable.length)} importáveis:`);
  console.log(
    `${"Nome".padEnd(40)} | ${"Status".padEnd(24)} | ${"Consultor".padEnd(18)} | Valor`,
  );
  console.log("-".repeat(110));
  for (const r of importable.slice(0, 30)) {
    const p = r.payload!;
    const valor = (p.valorCreditoCentavos as number | null)
      ? `R$ ${((p.valorCreditoCentavos as number) / 100).toLocaleString("pt-BR")}`
      : "—";
    console.log(
      `${String(p.nome).slice(0, 40).padEnd(40)} | ${String(p.status).padEnd(24)} | ${(r.consultorNomeNotion ?? "—").padEnd(18)} | ${valor}`,
    );
  }
  if (importable.length > 30) {
    console.log(`... +${importable.length - 30} outros`);
  }

  if (!apply) {
    console.log("\n" + "=".repeat(80));
    console.log("🔍 DRY-RUN — nada foi inserido. Re-execute com --apply pra importar.");
    console.log("=".repeat(80));
    process.exit(0);
  }

  // ===== INSERT (UPSERT por notion_id) =====
  console.log("\n" + "=".repeat(80));
  console.log(`💾 IMPORTANDO ${importable.length} leads...`);
  console.log("=".repeat(80));

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const r of importable) {
    try {
      const p = r.payload!;
      const result = await db
        .insert(leadsTable)
        .values(p as never)
        .onConflictDoUpdate({
          target: leadsTable.notionId,
          set: {
            // Atualiza só campos que vieram. Não mexe em consultorId,
            // status, etc. — assume que o banco já tem o estado mais
            // recente se foi importado antes (cuidado se importar 2x).
            updatedAt: new Date(),
          },
        })
        .returning({ id: leadsTable.id, isNew: sql<boolean>`(xmax = 0)` });
      if (result[0]?.isNew) inserted++;
      else updated++;

      // Cria interação tipo evento_sistema pra rastreabilidade.
      if (result[0]?.id) {
        const semConsultor = r.consultorId == null;
        const conteudo = semConsultor
          ? `Lead importado do Notion (sem consultor designado). Status original: "${r.statusOriginal}" (mapeado para "${r.statusMapeado}"). Aguardando atribuição manual.`
          : `Lead importado do Notion. Status original: "${r.statusOriginal}" (mapeado para "${r.statusMapeado}").`;
        await db.insert(interacoes).values({
          leadId: result[0].id,
          autorId: r.consultorId ?? null, // null OK — interacoes.autor_id é nullable
          tipo: "evento_sistema",
          conteudo,
          metadata: {
            source: "notion_import",
            notion_id: r.notionId,
            status_original: r.statusOriginal,
            sem_consultor: semConsultor,
          } as never,
        });
      }
    } catch (e) {
      failed++;
      const err = e as Error & { code?: string; detail?: string; cause?: { message?: string } };
      console.error(`  ✗ ${r.filename}`);
      console.error(`     msg: ${err.message}`);
      if (err.code) console.error(`     code: ${err.code}`);
      if (err.detail) console.error(`     detail: ${err.detail}`);
      if (err.cause?.message) console.error(`     cause: ${err.cause.message}`);
      // Sem early-abort: se for problema sistêmico (ex: schema), o user vê o
      // erro 1x e roda novamente após corrigir. Com early-abort, parcial fica
      // em estado intermediário ruim.
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`✅ Inseridos:  ${inserted}`);
  console.log(`↻  Atualizados: ${updated}`);
  console.log(`✗  Falhas:     ${failed}`);
  console.log("=".repeat(80));

  process.exit(0);
}

main().catch((e: Error) => {
  console.error("FATAL:", e.message);
  console.error(e.stack);
  process.exit(1);
});
