import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  illustration?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Compact pra dentro de cards/colunas pequenas. */
  size?: "default" | "sm";
};

export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
  size = "default",
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "default" ? "py-12 px-6 gap-4" : "py-6 px-4 gap-2.5",
        className,
      )}
    >
      {illustration && (
        <div
          className={cn(
            "text-fg-faint",
            size === "default" ? "w-[180px]" : "w-[120px]",
          )}
          aria-hidden
        >
          {illustration}
        </div>
      )}
      <div className="space-y-1.5 max-w-md">
        <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="font-serif italic text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
