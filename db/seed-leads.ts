// Popular CRM com 50 leads variados pra teste profundo.
// Run: node --env-file=.env.local --import tsx db/seed-leads.ts
//
// Distribuição:
//   - ~17 leads pra Gabriel Marinho Meirelles
//   - ~17 leads pra Rodrigo
//   - ~16 leads sem atribuição (pool)
// Status spread sobre todos os 10 valores; datas spread em últimos 90 dias.
// Inclui interações pra alguns leads pra popular timeline.
// CPFs FAKES (não geram match em validação real). WhatsApp em formato E.164.

import { eq, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  interacoes,
  leads as leadsTable,
  users as usersTable,
} from "./schema";

const CIDADES_SC = [
  ["Blumenau", "SC"],
  ["Joinville", "SC"],
  ["Florianópolis", "SC"],
  ["Itajaí", "SC"],
  ["Balneário Camboriú", "SC"],
  ["Brusque", "SC"],
  ["Chapecó", "SC"],
];

const CIDADES_PR = [
  ["Curitiba", "PR"],
  ["Londrina", "PR"],
  ["Maringá", "PR"],
  ["Cascavel", "PR"],
];

const CIDADES_RS = [
  ["Porto Alegre", "RS"],
  ["Caxias do Sul", "RS"],
  ["Pelotas", "RS"],
];

const CIDADES_SP = [
  ["São Paulo", "SP"],
  ["Campinas", "SP"],
  ["Santos", "SP"],
  ["Ribeirão Preto", "SP"],
  ["São José dos Campos", "SP"],
];

const CIDADES = [...CIDADES_SC, ...CIDADES_PR, ...CIDADES_RS, ...CIDADES_SP];

const NOMES_PF = [
  "Ana Paula Souza",
  "Bruno Henrique Lima",
  "Carla Beatriz Mendes",
  "Diego Ferreira Alves",
  "Eduarda Carvalho Pinto",
  "Felipe Augusto Rocha",
  "Gabriela Marques Dias",
  "Henrique Costa Barbosa",
  "Isabela Rodrigues Nunes",
  "João Vitor Macedo",
  "Karine Almeida Pereira",
  "Lucas Bernardo Teixeira",
  "Mariana Castro Vieira",
  "Nathália Oliveira Brito",
  "Otávio Ribeiro Câmara",
  "Patrícia Lopes Andrade",
  "Quésia Faria Cunha",
  "Rafael Moraes Antunes",
  "Sabrina Pacheco Cardoso",
  "Thiago Nunes Barros",
  "Ursula Reis Goulart",
  "Vinícius Tavares Sales",
  "Wallace Borges Magalhães",
  "Xênia Duarte Coelho",
  "Yasmin Peixoto Coutinho",
  "Zacarias Monteiro Vargas",
  "Aline Salvador Drumond",
  "Beatriz Cordeiro Mota",
  "Caio Esteves Monteiro",
  "Daniela Falcão Quintela",
  "Emerson Galvão Tavora",
  "Fabiane Holanda Veloso",
  "Gustavo Iglesias Wanderley",
  "Helena Justo Ximenes",
  "Igor Klein Brandão",
  "Júlia Larussa Aguiar",
  "Kauê Mendonça Bittencourt",
  "Letícia Navarro Cordeiro",
  "Murilo Otoni Damasceno",
  "Natália Pizarro Eluf",
  "Olavo Quirino Façanha",
  "Priscila Roque Galante",
  "Quintino Sátiro Hage",
  "Roberta Tibúrcio Iolanda",
  "Sérgio Uchôa Jovino",
  "Talita Vieira Kimura",
  "Ubaldo Werneck Lacerda",
  "Vanessa Xavier Mansur",
  "Wagner Yunes Nóbrega",
  "Ximena Zampronio Olivetti",
];

const STATUS_DIST: Array<{ status: string; weight: number }> = [
  { status: "novo", weight: 12 },
  { status: "conversa_inicial", weight: 8 },
  { status: "aguardando_resposta", weight: 7 },
  { status: "aguardando_documentacao", weight: 6 },
  { status: "documentacao_enviada", weight: 4 },
  { status: "em_negociacao", weight: 4 },
  { status: "fechado", weight: 5 },
  { status: "perdido", weight: 2 },
  { status: "sem_resposta", weight: 1 },
  { status: "desqualificado", weight: 1 },
];

const ORIGENS = [
  "Google",
  "Google",
  "Google",
  "Instagram",
  "Instagram",
  "Facebook",
  "YouTube",
  "Orgânico",
  "Indicação",
  "Indicação",
  "LinkedIn",
  "ChatGPT",
  "Condomínio",
  "Manual",
];

const TIPOS_IMOVEL = ["Casa", "Apartamento", "Comercial", "Terreno", "Rural"];
const SITUACOES = ["Quitado", "Financiado", "Em Inventário"];
const OCUPACOES = [
  "CLT",
  "Autônomo",
  "Empresário",
  "Servidor Público",
  "Aposentado",
];
const OBJETIVOS = [
  "Quitar Dívidas",
  "Capital de Giro",
  "Investimento",
  "Reforma",
  "Outro",
];
const ESTADOS_CIVIS = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "União Estável",
];
const BANCOS = [
  "Itaú BBA",
  "Bradesco",
  "Santander",
  "BV Financeira",
  "BTG Pactual",
  "Caixa",
];
const MOTIVOS_PERDA = [
  "Imóvel não atende critérios",
  "Renda insuficiente",
  "Localização fora da política",
  "LTV muito alto",
  "Restrições no nome",
  "Cliente desistiu",
  "Taxa não competitiva",
  "Já fechou com concorrente",
  "Documentação irregular",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickWeighted<T extends { weight: number }>(arr: T[]): T {
  const total = arr.reduce((s, i) => s + i.weight, 0);
  let n = Math.random() * total;
  for (const item of arr) {
    n -= item.weight;
    if (n <= 0) return item;
  }
  return arr[arr.length - 1]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fakeCpf(i: number): string {
  // Sequencial fake — não passa em validador real, intencional pra teste.
  const base = String(100000000 + i * 137).padStart(9, "0");
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-${String(
    (i * 7) % 100,
  ).padStart(2, "0")}`;
}

function fakeWhatsapp(i: number): string {
  // +55 + DDD + 9 + 8 dígitos
  const ddds = ["47", "11", "21", "41", "51", "62", "31", "85"];
  const ddd = ddds[i % ddds.length]!;
  const num = String(900000000 + i * 1234567).slice(0, 9);
  return `+55${ddd}${num}`;
}

function randomDateBetween(daysAgoMin: number, daysAgoMax: number): Date {
  const min = Date.now() - daysAgoMax * 86400_000;
  const max = Date.now() - daysAgoMin * 86400_000;
  return new Date(min + Math.random() * (max - min));
}

async function main() {
  console.log("→ Resolvendo consultores…");
  const consultores = await db
    .select({ id: usersTable.id, nome: usersTable.nome })
    .from(usersTable)
    .where(eq(usersTable.ativo, true));

  const gabriel = consultores.find((c) => c.nome.startsWith("Gabriel Marinho"));
  const rodrigo = consultores.find((c) => c.nome.startsWith("Rodrigo"));

  if (!gabriel || !rodrigo) {
    console.error(
      "Não encontrei Gabriel Marinho e/ou Rodrigo. Consultores ativos:",
      consultores.map((c) => c.nome),
    );
    process.exit(1);
  }

  console.log(`  Gabriel: ${gabriel.id}`);
  console.log(`  Rodrigo: ${rodrigo.id}`);

  // Limpa leads "Demo" pré-existentes
  console.log("→ Limpando leads de seed prévios…");
  await db.execute(
    sql`DELETE FROM public.leads WHERE nome LIKE 'Lead Demo %' OR raw_payload->>'_seed' = 'leads-50'`,
  );

  console.log("→ Inserindo 50 leads…");

  const rows: Array<typeof leadsTable.$inferInsert> = [];
  const interactionsToInsert: Array<{
    leadIdx: number;
    autorId: string | null;
    tipo: string;
    conteudo: string;
    daysAgo: number;
  }> = [];

  for (let i = 0; i < 50; i++) {
    const status = pickWeighted(STATUS_DIST).status as
      | "novo"
      | "conversa_inicial"
      | "aguardando_resposta"
      | "aguardando_documentacao"
      | "documentacao_enviada"
      | "em_negociacao"
      | "fechado"
      | "perdido"
      | "sem_resposta"
      | "desqualificado";

    // Distribuição: ~34% Gabriel, ~34% Rodrigo, ~32% pool
    const r = Math.random();
    let consultorId: string | null = null;
    if (r < 0.34) consultorId = gabriel.id;
    else if (r < 0.68) consultorId = rodrigo.id;
    // else null = pool

    // Status terminal precisa estar atribuído (regra de negócio implícita)
    if ((status === "fechado" || status === "perdido") && !consultorId) {
      consultorId = Math.random() < 0.5 ? gabriel.id : rodrigo.id;
    }

    const cidade = pick(CIDADES);
    const nome = NOMES_PF[i % NOMES_PF.length]!;
    const valorImovel = randInt(300_000, 2_500_000);
    const valorCredito = Math.floor(valorImovel * (0.3 + Math.random() * 0.35)); // 30-65% LTV
    const renda = randInt(5_000, 60_000);

    const createdAt = randomDateBetween(2, 90);
    const atribuidoEm = consultorId
      ? new Date(createdAt.getTime() + randInt(1, 60) * 60_000)
      : null;
    const ultimoContato =
      status !== "novo" && Math.random() > 0.2
        ? new Date(createdAt.getTime() + randInt(1, 30) * 86400_000)
        : null;

    const isFechado = status === "fechado";
    const isPerdido = status === "perdido" || status === "desqualificado";

    rows.push({
      nome,
      cpf: fakeCpf(i),
      estadoCivil: pick(ESTADOS_CIVIS),
      ocupacao: pick(OCUPACOES),
      rendaMensalCentavos: renda * 100,
      whatsapp: fakeWhatsapp(i),
      email: `${nome.toLowerCase().replace(/[^\w]+/g, ".")}.demo@example.com`,
      cidade: cidade[0],
      estado: cidade[1],
      produto: "CGI",
      objetivoCredito: pick(OBJETIVOS),
      tipoImovel: pick(TIPOS_IMOVEL),
      situacaoImovel: pick(SITUACOES),
      tipoPessoa: "Pessoa Física",
      valorImovelCentavos: valorImovel * 100,
      valorCreditoCentavos: valorCredito * 100,
      status,
      motivoDesqualificacao: isPerdido ? pick(MOTIVOS_PERDA) : null,
      consultorId,
      atribuidoEm,
      atribuidoPor: consultorId ? gabriel.id : null,
      origem: pick(ORIGENS),
      utmSource: Math.random() > 0.6 ? "google" : null,
      utmMedium: Math.random() > 0.6 ? "cpc" : null,
      utmCampaign:
        Math.random() > 0.5
          ? pick(["cgi-blumenau", "cgi-sul", "remarketing-q4", "fast-2026"])
          : null,
      gclid:
        Math.random() > 0.7
          ? `Cj0KCQiA${Math.random().toString(36).slice(2, 14)}`
          : null,
      rede: Math.random() > 0.7 ? pick(["Google Search", "YouTube"]) : null,
      dispositivo: pick(["Mobile", "Desktop", "Tablet"]),
      bancoAprovador: isFechado ? pick(BANCOS) : null,
      valorLiberadoCentavos: isFechado
        ? Math.floor(valorCredito * (0.85 + Math.random() * 0.1)) * 100
        : null,
      comissaoCentavos: isFechado
        ? Math.floor(valorCredito * 0.018) * 100
        : null,
      dataFechamento: isFechado
        ? new Date(createdAt.getTime() + randInt(20, 60) * 86400_000)
            .toISOString()
            .slice(0, 10)
        : null,
      rawPayload: { _seed: "leads-50" },
      ultimoContato,
      createdAt,
      updatedAt: ultimoContato ?? createdAt,
      createdBy: consultorId,
    });

    // Interações realísticas pra ~60% dos leads. Respeitam atribuido_em.
    if (atribuidoEm && Math.random() > 0.4) {
      const numInter = randInt(1, 4);
      // Janela: do atribuido_em até hoje
      const minutosDisponiveis = Math.max(
        15,
        Math.floor((Date.now() - atribuidoEm.getTime()) / 60_000),
      );
      for (let k = 0; k < numInter; k++) {
        const tipo = pick([
          "ligacao",
          "whatsapp_enviado",
          "whatsapp_recebido",
          "anotacao",
          "email",
        ]);
        // Primeira interação dentro de 5–120 min do atribuido_em (pra simular SLA realístico)
        const offsetMin =
          k === 0
            ? randInt(5, Math.min(120, minutosDisponiveis))
            : randInt(120, minutosDisponiveis);
        const daysAgo = (Date.now() - (atribuidoEm.getTime() + offsetMin * 60_000)) / 86400_000;
        const conteudos: Record<string, string[]> = {
          ligacao: [
            "Cliente atendeu, pediu retorno depois de amanhã.",
            "Liguei, caiu na caixa postal. Vou tentar via WhatsApp.",
            "Conversa rápida, cliente confirmou interesse no CGI.",
          ],
          whatsapp_enviado: [
            "Enviei mensagem inicial apresentando a Credios.",
            "Mandei tabela de taxas e prazos.",
            "Solicitei documentos: matrícula, IPTU, CNH, comprovante de renda.",
          ],
          whatsapp_recebido: [
            "Cliente respondeu pedindo mais informações sobre prazo.",
            "Cliente confirmou que vai enviar os documentos esta semana.",
            "Cliente pediu pra ser contatado depois das 18h.",
          ],
          anotacao: [
            "Cliente já tem outra cotação em outro banco.",
            "Imóvel está em nome do pai (falecido) — verificar inventário.",
            "Cliente prefere taxa pré-fixada.",
          ],
          email: [
            "Enviei proposta inicial por email.",
            "Mandei resumo da operação proposta.",
          ],
        };
        interactionsToInsert.push({
          leadIdx: i,
          autorId: consultorId,
          tipo,
          conteudo: pick(conteudos[tipo] ?? ["—"]),
          daysAgo,
        });
      }
    }
  }

  // Insere leads em batches
  const inserted = await db
    .insert(leadsTable)
    .values(rows)
    .returning({ id: leadsTable.id });

  console.log(`  ✓ ${inserted.length} leads inseridos`);

  // Insere interações vinculando ao id retornado
  if (interactionsToInsert.length > 0) {
    const interRows = interactionsToInsert.map((it) => ({
      leadId: inserted[it.leadIdx]!.id,
      autorId: it.autorId,
      tipo: it.tipo as
        | "ligacao"
        | "whatsapp_enviado"
        | "whatsapp_recebido"
        | "email"
        | "reuniao"
        | "anotacao"
        | "documento_recebido"
        | "mudanca_status"
        | "mudanca_atribuicao"
        | "evento_sistema",
      conteudo: it.conteudo,
      criadoEm: new Date(Date.now() - it.daysAgo * 86400_000),
    }));

    await db.insert(interacoes).values(interRows);
    console.log(`  ✓ ${interRows.length} interações inseridas`);
  }

  // Resumo final
  const summary = await db.execute<{
    consultor: string | null;
    status: string;
    count: string;
  }>(sql`
    SELECT
      COALESCE(u.nome, 'POOL') AS consultor,
      l.status::text AS status,
      COUNT(*)::text AS count
    FROM public.leads l
    LEFT JOIN public.users u ON u.id = l.consultor_id
    WHERE l.raw_payload->>'_seed' = 'leads-50'
    GROUP BY u.nome, l.status
    ORDER BY u.nome NULLS LAST, l.status
  `);

  console.log("\n→ Resumo:");
  for (const row of summary) {
    const cons = (row.consultor ?? "POOL").padEnd(28);
    console.log(`  ${cons} | ${row.status.padEnd(26)} | ${row.count}`);
  }

  await db.execute(sql`SELECT 1`); // wake pool
  console.log("\n✓ Done. Pra remover: DELETE FROM leads WHERE raw_payload->>'_seed' = 'leads-50';");
  process.exit(0);
}

main().catch((e) => {
  console.error("ERR:", e.message ?? e);
  console.error("CAUSE:", (e as { cause?: { message?: string } }).cause?.message);
  process.exit(1);
});
