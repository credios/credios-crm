import "server-only";

import { and, asc, eq, isNull, ne, or } from "drizzle-orm";

import { duplicidadesPendentes, leads } from "../../../db/schema";
import { db } from "@/lib/db";

/**
 * Mesmo CPF em outro lead → registra em `duplicidades_pendentes` pra revisão
 * (§6.2 passo 4: não bloqueia, só avisa). Roda em todo caminho que grava CPF:
 * criação (webhook e manual), enriquecimento do simulador e edição. Antes só
 * rodava na criação pelo webhook, e o simulador manda o CPF na 2ª etapa — a
 * fila ficou vazia de mai/2026 a out/2026 com 17 CPFs repetidos.
 *
 * Par que já tem pendência aberta (em qualquer direção) não duplica. Devolve
 * o id do lead mais antigo com o CPF, se houver.
 */
export async function registrarDuplicidadeCpf(
  leadId: string,
  cpf: string | null | undefined,
): Promise<string | null> {
  if (!cpf) return null;
  const [outro] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.cpf, cpf), ne(leads.id, leadId)))
    .orderBy(asc(leads.createdAt))
    .limit(1);
  if (!outro) return null;

  const [aberta] = await db
    .select({ id: duplicidadesPendentes.id })
    .from(duplicidadesPendentes)
    .where(
      and(
        isNull(duplicidadesPendentes.resolvidoEm),
        or(
          and(
            eq(duplicidadesPendentes.novoLeadId, leadId),
            eq(duplicidadesPendentes.leadExistenteId, outro.id),
          ),
          and(
            eq(duplicidadesPendentes.novoLeadId, outro.id),
            eq(duplicidadesPendentes.leadExistenteId, leadId),
          ),
        ),
      ),
    )
    .limit(1);
  if (!aberta) {
    await db.insert(duplicidadesPendentes).values({
      novoLeadId: leadId,
      leadExistenteId: outro.id,
      cpf,
    });
  }
  return outro.id;
}
