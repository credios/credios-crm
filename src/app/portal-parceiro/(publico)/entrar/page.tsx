import { redirect } from "next/navigation";

import { LoginForm } from "@/components/portal-parceiro/auth-forms";
import { getParceiroSessao } from "@/lib/portal-parceiro/sessao";

export const metadata = { title: "Entrar" };

type Props = { searchParams: Promise<{ senha?: string }> };

export default async function EntrarPage({ searchParams }: Props) {
  if (await getParceiroSessao()) redirect("/portal-parceiro");
  const { senha } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Entrar</h1>
      <LoginForm aviso={senha === "ok" ? "Senha redefinida. Entre com a nova senha." : undefined} />
    </div>
  );
}
