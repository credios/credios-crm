import { TrocarSenhaForm } from "@/components/portal-parceiro/auth-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirParceiro } from "@/lib/portal-parceiro/sessao";
import { PRODUTO_LABEL, type Produto } from "@/lib/produtos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const sessao = await exigirParceiro();
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seus dados</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-y-2 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
            <dt className="text-muted-foreground">Parceiro</dt>
            <dd>{sessao.parceiroNome}</dd>
            <dt className="text-muted-foreground">Login</dt>
            <dd>{sessao.email}</dd>
            <dt className="text-muted-foreground">Produtos habilitados</dt>
            <dd>
              {sessao.produtosHabilitados
                .map((p) => PRODUTO_LABEL[p as Produto] ?? p)
                .join(" · ")}
            </dd>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Para alterar cadastro, dados de pagamento ou produtos, fale com a Credios.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alterar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <TrocarSenhaForm />
        </CardContent>
      </Card>
    </>
  );
}
