import Link from "next/link";

import { RecuperarForm } from "@/components/portal-parceiro/auth-forms";

export const metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Recuperar senha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe o e-mail do seu acesso e enviamos um link para criar uma nova senha.
        </p>
      </div>
      <RecuperarForm />
      <p className="text-center text-sm">
        <Link href="/portal-parceiro/entrar" className="text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
