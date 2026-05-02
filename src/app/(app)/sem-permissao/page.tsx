import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SemPermissaoPage() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Sem permissão</CardTitle>
        <CardDescription>
          Você não tem permissão para acessar essa área. Se acredita que é um
          erro, fale com um administrador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button nativeButton={false} render={<Link href="/leads">Voltar para Leads</Link>} />
      </CardContent>
    </Card>
  );
}
