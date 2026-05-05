import { NextResponse, type NextRequest } from "next/server";

import { logAction } from "@/lib/audit";
import { generateDailyTasks } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";

/**
 * Cron diário (08h BRT, dias úteis) que:
 *   1. Marca tarefas vencidas como "atrasada"
 *   2. Gera novas tarefas pra leads ativos conforme task_config_por_status
 *
 * NÃO envia e-mails — os consultores veem o playbook no próprio CRM
 * (Minha Mesa). Decisão tomada para reduzir ruído de inbox: o time já
 * acessa o CRM diariamente, não faz sentido duplicar o conteúdo via mail.
 *
 * Envio de e-mails do simulador/lead novo continua via webhooks (vide
 * src/app/api/webhooks/lead/route.ts).
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = await generateDailyTasks(now);

  await logAction(null, null, "tarefas_diarias_geradas", "tarefa", null, result);

  return NextResponse.json({ ok: true, ...result });
}
