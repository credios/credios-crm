import { NextResponse, type NextRequest } from "next/server";

import { logAction } from "@/lib/audit";
import { isBusinessDayBrt } from "@/lib/datetime/brt";
import { sendOverdueTaskEmail } from "@/lib/tasks/email";
import { markOverdueTasks } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";

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
  const emailResult = await sendOverdueTaskEmail();

  await logAction(null, null, "tarefas_atrasadas_notificadas", "tarefa", null, {
    marked,
    emailResult,
  });

  return NextResponse.json({ ok: true, businessDay: true, marked, emailResult });
}
