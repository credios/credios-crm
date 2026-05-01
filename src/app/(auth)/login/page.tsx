import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { error, redirectTo } = await searchParams;
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">CRM Credios</CardTitle>
        <CardDescription>Entre na sua conta para continuar</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm error={error} redirectTo={redirectTo} />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/recuperar-senha" className="hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
