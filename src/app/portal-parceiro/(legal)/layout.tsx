import Link from "next/link";

// Páginas legais do Portal de Parceiros — públicas (o parceiro lê antes de
// criar a senha).
export default function PortalLegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/portal-parceiro" className="font-semibold tracking-tight">
            Credios <span className="font-normal text-muted-foreground">Parceiros</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>
      <footer className="border-t">
        <nav className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-2 px-6 py-8 text-sm text-muted-foreground">
          <Link href="/portal-parceiro/termos" className="hover:text-foreground">Termos de Uso</Link>
          <Link href="/portal-parceiro/privacidade" className="hover:text-foreground">Aviso de Privacidade</Link>
          <Link href="/portal-parceiro/verificar" className="hover:text-foreground">Verificar contrato</Link>
        </nav>
      </footer>
    </>
  );
}
