"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { NAV_GROUPS } from "./nav-config";

type Props = {
  isAdmin: boolean;
  isConsultor?: boolean;
  isMarketing?: boolean;
  /** Quando renderizada dentro do Sheet mobile, callback para fechar ao clicar. */
  onNavigate?: () => void;
  className?: string;
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  isAdmin,
  isConsultor,
  isMarketing,
  onNavigate,
  className,
}: Props) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex h-full flex-col gap-5 py-3", className)}>
      {NAV_GROUPS.map((group) => {
        const visible = group.items.filter(
          (i) =>
            (!i.adminOnly || isAdmin) &&
            !(isConsultor && i.hideForConsultor) &&
            !(isMarketing && i.hideForMarketing),
        );
        if (visible.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="px-6 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              {group.label}
            </p>
            <ul className="space-y-0.5 px-3">
              {visible.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group/nav relative flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-[background,color] duration-fast ease-out-soft",
                        active
                          ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-200"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-x-3 -translate-y-1/2 rounded-full bg-primary"
                        />
                      )}
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active && "text-primary",
                        )}
                        strokeWidth={active ? 2 : 1.75}
                      />
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
