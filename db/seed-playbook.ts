// Seed dos 3 templates de playbook inicial — mensagens "fixas" que o
// consultor envia em sequência logo nos primeiros contatos.
//
// Ordem do atendimento (atualizada em 2026-06-22): saudação → convite para
// ligação → envio da simulação. A ligação passou a acontecer assim que o lead
// responde a primeira mensagem.
//
// Idempotente: se já existir template com o mesmo `nome`, faz UPDATE do
// conteúdo + statusAplicavel + ordem; senão INSERT.
//
// Conteúdo/status/ordem reconciliados com produção em 2026-06-22. A fonte real
// é o banco (editável em Configurações → Mensagens); rodar este script apenas
// re-sincroniza estes 3 templates ao estado abaixo — ele NÃO mexe nos demais
// templates criados pela interface.
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
    statusAplicavel: ["novo", "conversa_inicial"],
    conteudo: `{{saudacao}}, {{primeiro_nome}}! Tudo bem?

Aqui é o {{primeiro_nome_consultor}}, da CREDIOS. Vi que você solicitou uma simulação de crédito com garantia de imóvel.

Só pra confirmar os dados que você informou:
• Imóvel avaliado em aproximadamente {{valor_imovel}}
• Crédito desejado de {{valor_credito}}

Está correto?`,
  },
  {
    nome: "2. Convite para ligação",
    ordem: 2,
    statusAplicavel: ["novo", "conversa_inicial", "aguardando_resposta"],
    conteudo: `Perfeito, {{primeiro_nome}}, podemos falar rapidamente por telefone para entender melhor sua demanda, seu objetivo e podermos avançar da melhor maneira possível?`,
  },
  {
    nome: "3. Envio da simulação em PDF",
    ordem: 3,
    statusAplicavel: ["novo", "conversa_inicial", "aguardando_resposta"],
    conteudo: `Perfeito. Vou te enviar uma simulação em PDF agora mesmo.`,
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
