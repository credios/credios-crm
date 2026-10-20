import { redirect } from "next/navigation";

import { SimulacaoCondominioEditor } from "./simulacao-condominio-editor";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getSimulacaoCondominioConfig } from "@/lib/simulador/config";

export const dynamic = "force-dynamic";

export default async function SimulacaoCondominioConfigPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  if (user.perfil !== "admin") redirect("/sem-permissao");

  const config = await getSimulacaoCondominioConfig();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          Simulação — condomínios
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Taxa por prazo e parâmetros da simulação em PDF que o parceiro habilitado em
          condomínio gera no portal. Mudou aqui, vale na próxima simulação — as já
          geradas mantêm as taxas da época.
        </p>
      </div>
      <SimulacaoCondominioEditor initial={config} />
    </div>
  );
}
