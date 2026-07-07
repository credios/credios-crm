import { redirect } from "next/navigation";

import { SimulacaoConfigEditor } from "./simulacao-editor";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getSimulacaoConfig } from "@/lib/simulador/config";

export const dynamic = "force-dynamic";

export default async function SimulacaoConfigPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.perfil !== "admin") redirect("/sem-permissao");

  const config = await getSimulacaoConfig();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Simulação — faixas da proposta
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Faixas de taxa, prazos e parâmetros usados na proposta em PDF gerada com 1
          clique na página do lead. Mudou aqui, valeu na hora — sem deploy.
        </p>
      </div>
      <SimulacaoConfigEditor initial={config} />
    </div>
  );
}
