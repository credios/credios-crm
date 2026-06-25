import Link from "next/link";

// Shell público das páginas legais (privacidade, termos, exclusão de dados).
// Fica FORA do grupo (app), então não passa pela auth — são páginas abertas,
// exigidas pelo Meta/WhatsApp e pela LGPD. Indexáveis por padrão.

const DOCS = [
  { href: "/privacidade", label: "Política de Privacidade" },
  { href: "/termos", label: "Termos de Serviço" },
  { href: "/exclusao-de-dados", label: "Exclusão de Dados" },
];

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a
            href="https://credios.com.br"
            className="font-semibold tracking-tight"
          >
            Credios
          </a>
          <span className="text-xs text-muted-foreground">
            Crédito com Garantia de Imóvel
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground">
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {DOCS.map((d) => (
              <Link key={d.href} href={d.href} className="hover:text-foreground">
                {d.label}
              </Link>
            ))}
          </nav>
          <p>
            © {new Date().getFullYear()} Credios — Blumenau/SC. Contato:{" "}
            <a
              href="mailto:gabriel.meirelles@credios.com.br"
              className="hover:text-foreground"
            >
              gabriel.meirelles@credios.com.br
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
