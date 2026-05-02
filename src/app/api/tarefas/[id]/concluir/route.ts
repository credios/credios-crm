import { after, NextResponse, type NextRequest } from "next/server";

import { extractRequestMeta, logAction } from "@/lib/audit";
import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { completeTask, getTaskWithLead } from "@/lib/tasks/service";
import { completeTaskSchema } from "@/lib/validators/task";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const task = await getTaskWithLead(id);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (
    !checkPermission(user, "task.complete", {
      type: "task",
      consultorId: task.consultorId,
    })
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = completeTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const completed = await completeTask(id, user.id, parsed.data);

  after(() =>
    logAction(
      null,
      user.id,
      "tarefa_concluida",
      "tarefa",
      id,
      { leadId: task.leadId, acao: parsed.data.acao },
      extractRequestMeta(request),
    ),
  );

  return NextResponse.json({ data: completed });
}
