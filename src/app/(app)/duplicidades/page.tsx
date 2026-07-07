import { aliasedTable, eq, isNull } from "drizzle-orm";
import { Copy } from "lucide-react";
import { redirect } from "next/navigation";

import { duplicidadesPendentes, leads as leadsTable } from "../../../../db/schema";
import { DuplicidadeCard } from "@/components/leads/duplicidade-card";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Fila de POSSÍVEIS DUPLICIDADES de CPF: o webhook cria o lead novo normalmente
// e registra o par aqui pra revisão humana (spec §6.2 — nunca bloqueia). Esta
// tela fecha o ciclo: até agora os registros se acumulavam invisíveis.

export default async function DuplicidadesPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (!isAdminOrGerente(user)) redirect("/sem-permissao");

  const leadNovo = aliasedTable(leadsTable, "lead_novo");
  const leadExistente = aliasedTable(leadsTable, "lead_existente");
  const pendentes = await db
    .select({
      id: duplicidadesPendentes.id,
      cpf: duplicidadesPendentes.cpf,
      criadoEm: duplicidadesPendentes.createdAt,
      novoId: leadNovo.id,
      novoNome: leadNovo.nome,
      novoStatus: leadNovo.status,
      novoCriadoEm: leadNovo.createdAt,
      existenteId: leadExistente.id,
      existenteNome: leadExistente.nome,
      existenteStatus: leadExistente.status,
      existenteCriadoEm: leadExistente.createdAt,
    })
    .from(duplicidadesPendentes)
    .innerJoin(leadNovo, eq(leadNovo.id, duplicidadesPendentes.novoLeadId))
    .innerJoin(leadExistente, eq(leadExistente.id, duplicidadesPendentes.leadExistenteId))
    .where(isNull(duplicidadesPendentes.resolvidoEm))
    .orderBy(duplicidadesPendentes.createdAt)
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] flex items-center gap-2">
          <Copy className="size-6 text-primary" strokeWidth={1.75} />
          Duplicidades de CPF
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          O mesmo CPF entrou mais de uma vez pelo webhook. O lead novo foi criado
          normalmente — aqui você decide se são casos separados legítimos ou se um
          deles deve ser encerrado (faça isso na página do lead).
        </p>
      </div>

      {pendentes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Nenhuma duplicidade pendente. 🎉
        </p>
      ) : (
        <div className="space-y-3">
          {pendentes.map((d) => (
            <DuplicidadeCard
              key={d.id}
              dup={{
                ...d,
                criadoEm: d.criadoEm.toISOString(),
                novoCriadoEm: d.novoCriadoEm.toISOString(),
                existenteCriadoEm: d.existenteCriadoEm.toISOString(),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
