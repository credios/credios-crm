import "server-only";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { parceiroContratos, parceiros } from "../../../db/schema";
import { db } from "@/lib/db";

import { convidarParceiro } from "./conta";

/**
 * Parceiros que já têm contrato assinado mas ainda não têm login no portal
 * novo — na prática, os que vieram do portal antigo. São os que precisam de
 * convite na virada (as senhas antigas não migram).
 */
export async function parceirosParaConvidar() {
  return db
    .select({ id: parceiros.id, nome: parceiros.nome, email: parceiros.email })
    .from(parceiros)
    .where(
      and(
        eq(parceiros.portalAcesso, "sem_acesso"),
        isNotNull(parceiros.email),
        sql`exists (
          select 1 from ${parceiroContratos} c
          where c.parceiro_id = ${parceiros.id}
            and ${inArray(sql`c.status`, ["assinado_parceiro", "concluido"])}
        )`,
      ),
    )
    .orderBy(parceiros.nome);
}

/** Convida todos, um a um. Falha de um não interrompe os demais. */
export async function convidarEmLote(autorId: string) {
  const alvos = await parceirosParaConvidar();
  const falhas: { nome: string; erro: string }[] = [];
  let enviados = 0;
  for (const p of alvos) {
    const r = await convidarParceiro(p.id, autorId);
    if (r.ok) enviados++;
    else falhas.push({ nome: p.nome, erro: r.erro });
  }
  return { total: alvos.length, enviados, falhas };
}
