import { RedefinirForm } from "@/components/portal-parceiro/auth-forms";

export const metadata = { title: "Nova senha" };

type Props = { params: Promise<{ token: string }> };

export default async function RedefinirSenhaPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Defina a nova senha</h1>
      <RedefinirForm token={token} />
    </div>
  );
}
