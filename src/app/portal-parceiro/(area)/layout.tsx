import { CabecalhoPortal } from "@/components/portal-parceiro/cabecalho";
import { exigirParceiro } from "@/lib/portal-parceiro/sessao";

// Área logada do parceiro. `exigirParceiro` também roda em cada página — o
// layout não é barreira suficiente sozinho (pode ser reaproveitado do cache).
export default async function AreaLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirParceiro();
  return (
    <>
      <CabecalhoPortal parceiroNome={sessao.parceiroNome} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
