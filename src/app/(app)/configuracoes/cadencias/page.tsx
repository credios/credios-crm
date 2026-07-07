import { redirect } from "next/navigation";

import { CadenciasEditor } from "./cadencias-editor";
import { getAppUser } from "@/lib/auth/get-app-user";

export const dynamic = "force-dynamic";

export default async function CadenciasPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.perfil !== "admin") redirect("/sem-permissao");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Cadências de follow-up
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          O playbook executável da Mesa: passos, dias, templates e frases de energia por
          estágio. Mudou aqui, valeu na hora — sem deploy. O último passo de cada cadência
          é sempre a decisão (continuar ou encerrar).
        </p>
      </div>
      <CadenciasEditor />
    </div>
  );
}
