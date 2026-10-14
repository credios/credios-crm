"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { SairButton } from "./auth-forms";

const NAV = [
  { href: "/portal-parceiro", label: "Início", exato: true },
  { href: "/portal-parceiro/clientes", label: "Meus clientes" },
  { href: "/portal-parceiro/comissoes", label: "Comissões" },
  { href: "/portal-parceiro/contrato", label: "Contrato" },
  { href: "/portal-parceiro/perfil", label: "Perfil" },
];

export function LogoCredios({ className }: { className?: string }) {
  return (
    <Image
      src="/credios-logo.png"
      alt="Credios"
      width={132}
      height={28}
      priority
      className={cn("h-7 w-auto", className)}
    />
  );
}

/** Cabeçalho da área logada: marca + conta em cima, navegação em abas embaixo
 *  (rola na horizontal no celular, em vez de quebrar em coluna). */
export function CabecalhoPortal({ parceiroNome }: { parceiroNome: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-3">
        <Link href="/portal-parceiro" className="flex items-center gap-2" aria-label="Início do portal">
          <LogoCredios />
          <span className="hidden text-sm text-muted-foreground sm:inline">Parceiros</span>
        </Link>
        <div className="flex min-w-0 items-center gap-1 text-sm">
          <span className="hidden truncate text-muted-foreground sm:inline">{parceiroNome}</span>
          <SairButton />
        </div>
      </div>
      <nav
        aria-label="Portal"
        className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-3"
      >
        {NAV.map((n) => {
          const ativo = n.exato ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              // Sem pré-carregamento: a página de contrato gera o documento.
              prefetch={false}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                ativo
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
