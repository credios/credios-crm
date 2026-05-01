import { redirect } from "next/navigation";

import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";

export default async function AuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const appUser = await getAppUser();
  if (!isAdmin(appUser)) {
    redirect("/sem-permissao");
  }
  return <>{children}</>;
}
