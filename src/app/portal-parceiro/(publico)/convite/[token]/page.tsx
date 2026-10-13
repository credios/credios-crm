import Link from "next/link";

import { ConviteForm } from "@/components/portal-parceiro/auth-forms";
import { lerConvite } from "@/lib/portal-parceiro/conta";

export const metadata = { title: "Criar senha" };

type Props = { params: Promise<{ token: string }> };

export default async function ConvitePage({ params }: Props) {
  const { token } = await params;
  const convite = await lerConvite(token);

  if (!convite) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">Convite indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Este convite expirou ou já foi usado. Peça um novo à Credios.
        </p>
        <Link href="/portal-parceiro/entrar" className="text-sm text-primary hover:underline">
          Já tenho senha
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Crie sua senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {convite.nome}, seu login será <strong>{convite.email}</strong>.
        </p>
      </div>
      <ConviteForm token={token} />
    </div>
  );
}
