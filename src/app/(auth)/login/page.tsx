import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { CrediosLogo } from "@/components/shared/credios-logo";
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
      <CardHeader className="space-y-3 text-center">
        <CrediosLogo size="lg" className="mx-auto" />
        <div className="space-y-1">
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-700 dark:text-gold-400">
            CRM
          </CardTitle>
          <CardDescription>Entre na sua conta para continuar</CardDescription>
        </div>
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
