import { NextResponse, type NextRequest } from "next/server";

import { getAppUser } from "@/lib/auth/get-app-user";
import { checkPermission } from "@/lib/auth/permissions";
import { listTasksForUser } from "@/lib/tasks/service";
import { listTasksQuerySchema } from "@/lib/validators/task";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!checkPermission(user, "task.list")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = listTasksQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const rows = await listTasksForUser({
    userId: user.id,
    perfil: user.perfil,
    status: parsed.data.status,
    consultorId: parsed.data.consultorId,
    data: parsed.data.data,
  });

  return NextResponse.json({ data: rows });
}
