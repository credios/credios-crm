"use client";

import { Flame, KanbanSquare, Search, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  exact?: boolean;
  /** Quando true, é um botão que abre command palette ao invés de Link. */
  asPaletteTrigger?: boolean;
};

const ITEMS: Item[] = [
  { href: "/minha-mesa", label: "Mesa", icon: Flame, exact: true },
  { href: "/leads", label: "Leads", icon: Users, exact: true },
  { href: "/leads/kanban", label: "Kanban", icon: KanbanSquare },
  { href: "#search", label: "Buscar", icon: Search, asPaletteTrigger: true },
  { href: "/perfil", label: "Perfil", icon: User },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="surface-frosted fixed bottom-0 left-0 right-0 z-40 flex h-16 items-stretch justify-around rounded-none border-x-0 border-b-0 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navegação principal"
    >
      {ITEMS.map((item) => {
        const active = !item.asPaletteTrigger && isActive(pathname, item.href, item.exact);
        const Icon = item.icon;

        if (item.asPaletteTrigger) {
          return (
            <button
              key={item.href}
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("crm:command-palette:open"),
                )
              }
              className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground transition-colors active:text-primary"
              aria-label="Abrir busca"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-4" strokeWidth={2} />
              </span>
            </button>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-fast",
              active ? "text-primary" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              className={cn("size-5", active && "text-primary")}
              strokeWidth={active ? 2 : 1.75}
            />
            <span className={cn("font-medium", active && "text-primary")}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
