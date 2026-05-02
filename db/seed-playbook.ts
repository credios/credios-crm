// Seed dos 3 templates de playbook inicial — mensagens "fixas" que o
// consultor envia em sequência logo nos primeiros contatos.
//
// Idempotente: se já existir template com o mesmo `nome`, faz UPDATE do
// conteúdo + statusAplicavel + ordem; senão INSERT.
//
// Run: npm run db:seed:playbook

import { eq, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { mensagensTemplate } from "./schema";

type Template = {
  nome: string;
  ordem: number;
  conteudo: string;
  statusAplicavel: string[];
};

const PLAYBOOK_INICIAL: Template[] = [
  {
    nome: "1. Saudação inicial e confirmação de dados",
    ordem: 1,
    statusAplicavel: ["novo", "conversa_inicial", "aguardando_resposta"],
    conteudo: `Bom dia, {{primeiro_nome}}! Tudo bem?

Aqui é o {{primeiro_nome_consultor}}, da CREDIOS. Vi que você solicitou uma simulação de crédito com garantia de imóvel.

Só pra confirmar os dados que você informou:
• Imóvel avaliado em aproximadamente R$ {{valor_imovel}}
• Crédito desejado de R$ {{valor_credito}}

Está correto?`,
  },
  {
    nome: "2. Envio da simulação em PDF",
    ordem: 2,
    statusAplicavel: ["novo", "conversa_inicial", "aguardando_resposta"],
    conteudo: `{{primeiro_nome}}, segue a sua simulação!

Preparei esse PDF com as condições que melhor se encaixam no seu perfil. Dá uma olhada com calma — ali você vai ver valores de parcela, taxas, prazos e o valor líquido que você receberia.`,
  },
  {
    nome: "3. Convite para ligação",
    ordem: 3,
    statusAplicavel: ["novo", "conversa_inicial", "aguardando_resposta"],
    conteudo: `Podemos falar rapidamente por telefone para entender melhor sua demanda, seu objetivo e podermos avançar da melhor maneira possível?`,
  },
];

async function main() {
  console.log("→ Sincronizando playbook inicial (3 templates)…");

  for (const t of PLAYBOOK_INICIAL) {
    // UPSERT manual via SELECT + INSERT/UPDATE
    const existing = await db
      .select({ id: mensagensTemplate.id })
      .from(mensagensTemplate)
      .where(eq(mensagensTemplate.nome, t.nome))
      .limit(1);

    // status_aplicavel virou text[] na migration 0003 — cast pra text[]
    // mantém compat com leads.status (text livre).
    if (existing.length > 0) {
      await db
        .update(mensagensTemplate)
        .set({
          conteudo: t.conteudo,
          ordem: t.ordem,
          statusAplicavel: sql.raw(
            `ARRAY[${t.statusAplicavel.map((s) => `'${s}'`).join(",")}]::text[]`,
          ),
          ativa: true,
        })
        .where(eq(mensagensTemplate.id, existing[0]!.id));
      console.log(`  ↻ atualizado: ${t.nome}`);
    } else {
      await db.execute(sql.raw(`
        INSERT INTO public.mensagens_template
          (nome, ordem, conteudo, status_aplicavel, ativa)
        VALUES (
          '${t.nome.replace(/'/g, "''")}',
          ${t.ordem},
          '${t.conteudo.replace(/'/g, "''")}',
          ARRAY[${t.statusAplicavel.map((s) => `'${s}'`).join(",")}]::text[],
          true
        )
      `));
      console.log(`  ✓ inserido:   ${t.nome}`);
    }
  }

  console.log("\n✓ Playbook sincronizado.");
  process.exit(0);
}

main().catch((e: Error & { cause?: { message?: string } }) => {
  console.error("ERR:", e.message);
  console.error("CAUSE:", e.cause?.message);
  process.exit(1);
});
