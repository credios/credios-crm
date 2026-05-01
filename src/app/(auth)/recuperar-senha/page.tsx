import Link from "next/link";

import { RecoverForm } from "@/components/auth/recover-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RecoverPasswordPage() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">Recuperar senha</CardTitle>
        <CardDescription>
          Informe seu email para receber um link de redefinição
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RecoverForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/login" className="hover:underline">
            Voltar ao login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
