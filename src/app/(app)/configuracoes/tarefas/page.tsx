import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { statusLeadConfig, taskConfigPorStatus } from "../../../../../db/schema";
import { TaskConfigList } from "@/components/configuracoes/task-config-list";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TasksConfigPage() {
  // Carrega TODOS os status ativos (não-terminais sistema + custom) e todas
  // as configs de tarefa existentes. UI cruza pra mostrar 1 row por status,
  // com a config se existir ou um placeholder se não.
  const [statuses, configs] = await Promise.all([
    db
      .select({
        key: statusLeadConfig.key,
        label: statusLeadConfig.label,
        eTerminal: statusLeadConfig.eTerminal,
        ordem: statusLeadConfig.ordem,
      })
      .from(statusLeadConfig)
      .where(eq(statusLeadConfig.ativo, true))
      .orderBy(asc(statusLeadConfig.ordem)),
    db.select().from(taskConfigPorStatus),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link href="/configuracoes">
              <ArrowLeft className="size-4" /> Configurações
            </Link>
          }
        />
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
            Tarefas por status
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
            Para cada status do funil, defina o título da tarefa, a descrição
            que o consultor verá e a frequência (1 = diária, 7 = semanal). Status
            terminais (lead concluído) não geram tarefas. Desativar pra parar de
            gerar tarefas pra leads naquele status.
          </p>
        </div>
      </div>
      <TaskConfigList statuses={statuses} configs={configs} />
    </div>
  );
}
