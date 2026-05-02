import { mensagensTemplate } from "../../../../../db/schema";
import { TemplatesPageClient } from "@/components/configuracoes/templates-page-client";
import type { TemplateRow } from "@/components/configuracoes/template-edit-dialog";
import { db } from "@/lib/db";

export default async function MensagensPage() {
  const rows = await db
    .select()
    .from(mensagensTemplate)
    .orderBy(mensagensTemplate.ordem, mensagensTemplate.nome);

  const initial: TemplateRow[] = rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    ordem: r.ordem,
    conteudo: r.conteudo,
    statusAplicavel: r.statusAplicavel ?? null,
    ativa: r.ativa,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Templates de mensagens</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Playbook do lead: aparecem como sugestão no detalhe filtrados por
          status. Variáveis substituídas no copiar.
        </p>
      </div>
      <TemplatesPageClient initial={initial} />
    </div>
  );
}
