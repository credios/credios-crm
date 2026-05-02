"use client";

import { KanbanSquare, List } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  current: "lista" | "kanban";
};

export function ViewToggle({ current }: Props) {
  const params = useSearchParams();
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  return (
    <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
      <Button
        variant={current === "lista" ? "secondary" : "ghost"}
        size="sm"
        nativeButton={false}
        render={
          <Link
            href={`/leads${suffix}`}
            className={cn(current === "lista" && "shadow-sm")}
          >
            <List className="size-4" /> Lista
          </Link>
        }
      />
      <Button
        variant={current === "kanban" ? "secondary" : "ghost"}
        size="sm"
        nativeButton={false}
        render={
          <Link
            href={`/leads/kanban${suffix}`}
            className={cn(current === "kanban" && "shadow-sm")}
          >
            <KanbanSquare className="size-4" /> Kanban
          </Link>
        }
      />
    </div>
  );
}
