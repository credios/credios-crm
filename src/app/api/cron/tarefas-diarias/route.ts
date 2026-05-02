import { NextResponse, type NextRequest } from "next/server";

import { logAction } from "@/lib/audit";
import { isBusinessDayBrt } from "@/lib/datetime/brt";
import { sendDailyTaskEmails } from "@/lib/tasks/email";
import { generateDailyTasks } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = await generateDailyTasks(now);
  let emailResult: Awaited<ReturnType<typeof sendDailyTaskEmails>> | null = null;
  if (isBusinessDayBrt(now)) {
    emailResult = await sendDailyTaskEmails(result.dataReferencia);
  }

  await logAction(null, null, "tarefas_diarias_geradas", "tarefa", null, {
    ...result,
    emailResult,
  });

  return NextResponse.json({ ok: true, ...result, emailResult });
}
