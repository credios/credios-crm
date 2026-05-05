import { NextResponse, type NextRequest } from "next/server";

import { logAction } from "@/lib/audit";
import { isBusinessDayBrt } from "@/lib/datetime/brt";
import { markOverdueTasks } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";

/**
 * Cron de fim de expediente (18h BRT, dias úteis): marca tarefas vencidas
 * como "atrasada" pra refletir corretamente no painel do consultor.
 *
 * NÃO envia e-mails — toda informação de tarefa fica visível no CRM
 * (Minha Mesa / Tarefas / Kanban). Mesmo princípio do cron tarefas-diarias.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (!isBusinessDayBrt(now)) {
    return NextResponse.json({ ok: true, businessDay: false, marked: 0 });
  }

  const marked = await markOverdueTasks(now);

  await logAction(null, null, "tarefas_atrasadas_notificadas", "tarefa", null, { marked });

  return NextResponse.json({ ok: true, businessDay: true, marked });
}
