import { IndicacaoForm, type IndicacaoInicial } from "@/components/portal-parceiro/indicacao-form";
import { maskCnpj } from "@/lib/formatters/cpf-cnpj";
import { exigirParceiroComContrato } from "@/lib/portal-parceiro/acesso";
import { simulacaoDoParceiro } from "@/lib/portal-parceiro/simulacoes";
import { PRODUTOS_ATIVOS } from "@/lib/produtos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Indicar cliente" };

type Props = { searchParams: Promise<{ simulacao?: string }> };

export default async function NovaIndicacaoPage({ searchParams }: Props) {
  const sessao = await exigirParceiroComContrato();
  // Só produtos que têm formulário próprio E estão habilitados pro parceiro.
  const produtos = PRODUTOS_ATIVOS.filter((p) => sessao.produtosHabilitados.includes(p));

  // Vindo de "Indicar este condomínio" numa simulação: já chega preenchido.
  const { simulacao } = await searchParams;
  const sim = simulacao ? await simulacaoDoParceiro(simulacao, sessao.parceiroId) : null;
  const inicial: IndicacaoInicial | undefined = sim
    ? {
        produto: "CONDOMINIO",
        nome: sim.condominioNome,
        documento: maskCnpj(sim.cnpj),
        valorCredito: String(Math.round(sim.valorCreditoCentavos / 100)),
        numUnidades: sim.numUnidades ? String(sim.numUnidades) : "",
        finalidade: sim.finalidade ?? "",
      }
    : undefined;

  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Indicar cliente</h1>
      {produtos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Seu cadastro ainda não tem produtos habilitados. Fale com a Credios.
        </p>
      ) : (
        <IndicacaoForm produtos={produtos} inicial={inicial} />
      )}
    </>
  );
}
