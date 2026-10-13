import Link from "next/link";

import { SairButton } from "@/components/portal-parceiro/auth-forms";
import { exigirParceiro } from "@/lib/portal-parceiro/sessao";

const NAV = [
  { href: "/portal-parceiro", label: "Início" },
  { href: "/portal-parceiro/clientes", label: "Meus clientes" },
  { href: "/portal-parceiro/comissoes", label: "Comissões" },
  { href: "/portal-parceiro/perfil", label: "Perfil" },
];

// Área logada do parceiro. `exigirParceiro` também roda em cada página — o
// layout não é barreira suficiente sozinho (pode ser reaproveitado do cache).
export default async function AreaLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirParceiro();
  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/portal-parceiro" className="font-display text-lg font-semibold tracking-[-0.02em]">
            Credios <span className="font-normal text-muted-foreground">Parceiros</span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Portal">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted-foreground hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{sessao.parceiroNome}</span>
            <SairButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">{children}</main>
    </>
  );
}
