"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { NAV_GROUPS } from "./nav-config";

type Props = {
  isAdmin: boolean;
  /** Quando renderizada dentro do Sheet mobile, callback para fechar ao clicar. */
  onNavigate?: () => void;
  className?: string;
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ isAdmin, onNavigate, className }: Props) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex h-full flex-col gap-6 py-4", className)}>
      {NAV_GROUPS.map((group) => {
        const visible = group.items.filter((i) => !i.adminOnly || isAdmin);
        if (visible.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="px-6 mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {visible.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 px-6 py-2 text-sm transition-colors",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
