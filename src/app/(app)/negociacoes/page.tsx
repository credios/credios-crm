import { Handshake } from "lucide-react";
import { redirect } from "next/navigation";

import { NegociacoesBoard } from "@/components/negociacoes/negociacoes-board";
import { getAppUser } from "@/lib/auth/get-app-user";
import { getNegociacoesAbertas } from "@/lib/negociacoes/queries";

export const revalidate = 30;
export const maxDuration = 30;

export default async function NegociacoesPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  // Marketing não atende leads — manda pra /leads (igual à Minha mesa).
  if (user.perfil === "marketing") redirect("/leads");

  const items = await getNegociacoesAbertas(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] flex items-center gap-2">
          <Handshake className="size-6 text-primary" strokeWidth={1.75} />
          Em negociação
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Seus leads na reta final — os de maior chance de fechar. Mantenha o
          contato diário e acompanhe o andamento com o cliente e com os bancos.
        </p>
      </div>

      <NegociacoesBoard items={items} />
    </div>
  );
}
