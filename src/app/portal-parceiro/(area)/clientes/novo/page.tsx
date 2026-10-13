import { IndicacaoForm } from "@/components/portal-parceiro/indicacao-form";
import { exigirParceiro } from "@/lib/portal-parceiro/sessao";
import { PRODUTOS_ATIVOS } from "@/lib/produtos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Indicar cliente" };

export default async function NovaIndicacaoPage() {
  const sessao = await exigirParceiro();
  // Só produtos que têm formulário próprio E estão habilitados pro parceiro.
  const produtos = PRODUTOS_ATIVOS.filter((p) => sessao.produtosHabilitados.includes(p));

  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Indicar cliente</h1>
      {produtos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Seu cadastro ainda não tem produtos habilitados. Fale com a Credios.
        </p>
      ) : (
        <IndicacaoForm produtos={produtos} />
      )}
    </>
  );
}
