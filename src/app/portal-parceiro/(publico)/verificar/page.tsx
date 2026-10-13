import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Verificar contrato" };

type Props = { searchParams: Promise<{ codigo?: string }> };

export default async function VerificarPage({ searchParams }: Props) {
  const { codigo } = await searchParams;
  if (codigo?.trim()) {
    redirect(`/portal-parceiro/verificar/${encodeURIComponent(codigo.trim().toUpperCase())}`);
  }
  return (
    <form className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Verificar contrato</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe o código impresso no rodapé do contrato para conferir a autenticidade.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vf-codigo">Código de verificação</Label>
        <Input id="vf-codigo" name="codigo" placeholder="CRD-XXXX-XXXX" autoCapitalize="characters" required />
      </div>
      <Button type="submit" className="w-full">Verificar</Button>
    </form>
  );
}
