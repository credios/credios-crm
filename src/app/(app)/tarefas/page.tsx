import { redirect } from "next/navigation";

import { TarefasPageClient } from "@/components/tarefas/tarefas-page-client";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { todayYmdBrt } from "@/lib/datetime/brt";
import { listConsultoresAtivos } from "@/lib/leads/list-leads";
import {
  activeLeadsWithoutOpenTaskCount,
  listCompletedTasksToday,
  listTasksForUser,
  taskStatsByConsultor,
} from "@/lib/tasks/service";
import { listTasksQuerySchema } from "@/lib/validators/task";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TarefasPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.perfil === "marketing") redirect("/sem-permissao");

  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && v.length > 0) flat[k] = v[0]!;
  }
  const filters = listTasksQuerySchema.parse(flat);
  const canManage = isAdminOrGerente(user);
  const today = todayYmdBrt();
  const [tasks, consultores, stats, semTarefa, completedToday] = await Promise.all([
    listTasksForUser({
      userId: user.id,
      perfil: user.perfil,
      status: filters.status,
      consultorId: canManage ? filters.consultorId : undefined,
      data: filters.data,
    }),
    canManage ? listConsultoresAtivos() : Promise.resolve([]),
    canManage ? taskStatsByConsultor(filters.data) : Promise.resolve([]),
    canManage ? activeLeadsWithoutOpenTaskCount() : Promise.resolve(0),
    // Lista de concluídas HOJE pra dashboard admin/gerente — independente
    // do filtro ativo na lista principal. Se gerente/admin filtrou outro
    // dia, esse bloco continua mostrando "hoje" pra termos visão imediata.
    canManage ? listCompletedTasksToday(today) : Promise.resolve([]),
  ]);

  return (
    <TarefasPageClient
      tasks={tasks}
      consultores={consultores}
      stats={stats}
      semTarefa={semTarefa}
      canManage={canManage}
      completedToday={completedToday}
      todayYmd={today}
    />
  );
}
