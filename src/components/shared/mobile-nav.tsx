"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { CrediosLogo } from "./credios-logo";
import { Sidebar } from "./sidebar";

export function MobileNav({
  isAdmin,
  isConsultor,
  isMarketing,
}: {
  isAdmin: boolean;
  isConsultor?: boolean;
  isMarketing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-[88vw] max-w-xs p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex flex-col items-start gap-1">
            <CrediosLogo size="md" />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-700 dark:text-gold-400 pl-7">
              CRM
            </span>
          </SheetTitle>
        </SheetHeader>
        <Sidebar
          isAdmin={isAdmin}
          isConsultor={isConsultor}
          isMarketing={isMarketing}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
