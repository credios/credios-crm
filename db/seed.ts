import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { type InferInsertModel } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { mensagensTemplate, users } from "./schema";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseServiceKey || !databaseUrl) {
  throw new Error(
    "Variáveis ausentes. Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e DATABASE_URL em .env.local.",
  );
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sqlClient = postgres(databaseUrl, { prepare: false });
const db = drizzle(sqlClient);

type SeedUser = {
  email: string;
  nome: string;
  perfil: "admin" | "gerente" | "consultor" | "marketing";
};

async function ensureAuthUser(seed: SeedUser): Promise<string> {
  // perPage máximo do Supabase Admin é 1000; suficiente pro MVP (8-10 users).
  const { data: list, error: listError } =
    await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error(`listUsers: ${listError.message}`);

  const existing = list.users.find((u) => u.email === seed.email);
  if (existing) {
    console.log(`  → auth.users já existe: ${seed.email} (${existing.id})`);
    return existing.id;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: seed.email,
    email_confirm: true,
    user_metadata: { nome: seed.nome },
  });
  if (error || !data.user) {
    throw new Error(
      `createUser ${seed.email}: ${error?.message ?? "user vazio"}`,
    );
  }
  console.log(`  → auth.users criado: ${seed.email} (${data.user.id})`);
  return data.user.id;
}

async function ensureAppUser(seed: SeedUser): Promise<void> {
  const id = await ensureAuthUser(seed);
  await db
    .insert(users)
    .values({ id, nome: seed.nome, email: seed.email, perfil: seed.perfil })
    .onConflictDoNothing();
  console.log(`  ✓ public.users garantido: ${seed.nome} (${seed.perfil})`);
}

type TemplateInsert = InferInsertModel<typeof mensagensTemplate>;
type TemplateSeed = Pick<
  TemplateInsert,
  "nome" | "ordem" | "statusAplicavel" | "conteudo"
>;

const TEMPLATES: TemplateSeed[] = [
  {
    nome: "Boas-vindas",
    ordem: 1,
    statusAplicavel: ["novo"],
    conteudo:
      "{{saudacao}}, {{primeiro_nome}}! Aqui é da Credios. Recebemos sua solicitação de crédito de R$ {{valor_credito}} com garantia de imóvel. Em instantes vamos te chamar para entender melhor o caso. ✅",
  },
  {
    nome: "Follow-up sem resposta",
    ordem: 2,
    statusAplicavel: ["novo", "conversa_inicial"],
    conteudo:
      "{{saudacao}}, {{primeiro_nome}}! Tudo bem? Vi que você estava interessado em crédito com garantia de imóvel. Conseguiu olhar minha mensagem anterior? Posso te ajudar a entender melhor as condições. 🙂",
  },
  {
    nome: "Solicitando documentação",
    ordem: 3,
    statusAplicavel: ["aguardando_documentacao"],
    conteudo:
      "{{saudacao}}, {{primeiro_nome}}! Para avançarmos com a análise da sua operação, preciso dos seguintes documentos: matrícula atualizada do imóvel, IPTU, RG/CNH, comprovante de renda dos últimos 3 meses e certidão de estado civil. Pode me enviar por aqui? 📎",
  },
  {
    nome: "Após desqualificação",
    ordem: 4,
    statusAplicavel: ["desqualificado", "perdido"],
    conteudo:
      "{{saudacao}}, {{primeiro_nome}}, agradeço o contato! Infelizmente, no momento não conseguimos atender o seu caso. Caso a situação mude no futuro, fique à vontade para nos procurar. Abraço!",
  },
  {
    nome: "Após fechamento",
    ordem: 5,
    statusAplicavel: ["fechado"],
    conteudo:
      "{{primeiro_nome}}, parabéns! Sua operação foi liberada com sucesso. Foi um prazer atender você. Qualquer coisa que precise daqui pra frente, é só chamar. 🤝",
  },
];

async function ensureTemplates(): Promise<void> {
  const existing = await db.select().from(mensagensTemplate).limit(1);
  if (existing.length > 0) {
    console.log(`  → mensagens_template já tem dados, pulando inserção`);
    return;
  }
  await db.insert(mensagensTemplate).values(TEMPLATES);
  console.log(`  ✓ ${TEMPLATES.length} templates inseridos`);
}

async function main() {
  console.log("🌱 Seed iniciado");

  console.log("\n[1/2] Usuários...");
  await ensureAppUser({
    // Email do Google Workspace pessoal — combina com o que o Supabase OAuth
    // recebe na primeira autenticação Google.
    email: "gabriel.meirelles@credios.com.br",
    nome: "Gabriel Marinho Meirelles",
    perfil: "admin",
  });
  await ensureAppUser({
    email: "rodrigo@credios.com.br",
    nome: "Rodrigo",
    perfil: "consultor",
  });

  console.log("\n[2/2] Templates de mensagem...");
  await ensureTemplates();

  console.log("\n✅ Seed concluído.");
  await sqlClient.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n❌ Seed falhou:", err);
  await sqlClient.end();
  process.exit(1);
});
