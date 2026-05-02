// Logo Credios reproduzido como SVG inline + wordmark HTML real.
// O wordmark fica em <span> com font Space Grotesk (não em <text> SVG)
// porque <text> SVG corta quando a font ainda não carregou — a largura do
// viewBox vira inadequada antes do swap.

import { cn } from "@/lib/utils";

type MarkProps = React.SVGProps<SVGSVGElement> & {
  className?: string;
};

/**
 * Mark sozinho — bowtie/hourglass formado por 2 triângulos.
 * Quadrado, escalável. Usar com `className="size-X"`.
 */
export function CrediosMark({ className, ...rest }: MarkProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={cn("text-primary", className)}
      aria-hidden
      {...rest}
    >
      <polygon points="0,0 50,50 0,100" fill="currentColor" />
      <polygon points="100,0 50,50 100,100" fill="currentColor" />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /**
   * Tamanho do mark e do wordmark juntos. Sizes mapeiam pra:
   *  - sm: mark 16px + texto 14px (header mobile)
   *  - md: mark 20px + texto 18px (sidebar/drawer)
   *  - lg: mark 28px + texto 26px (login)
   */
  size?: "sm" | "md" | "lg";
};

const SIZE_MAP: Record<
  NonNullable<LogoProps["size"]>,
  { mark: string; text: string; gap: string }
> = {
  sm: { mark: "size-4", text: "text-[14px] leading-none", gap: "gap-1.5" },
  md: { mark: "size-5", text: "text-[18px] leading-none", gap: "gap-2" },
  lg: { mark: "size-7", text: "text-[26px] leading-none", gap: "gap-2.5" },
};

/**
 * Lockup horizontal — mark + wordmark "CREDIOS" lado a lado.
 * Wordmark é HTML <span> em Space Grotesk com letter-spacing tight pra
 * imitar o lockup oficial sem depender do timing de carregamento da font.
 */
export function CrediosLogo({ className, size = "md" }: LogoProps) {
  const s = SIZE_MAP[size];
  return (
    <span
      className={cn(
        "inline-flex items-center text-primary",
        s.gap,
        className,
      )}
      aria-label="Credios"
      role="img"
    >
      <CrediosMark className={s.mark} />
      <span
        className={cn(
          "font-display font-bold uppercase tracking-[-0.02em]",
          s.text,
        )}
      >
        CREDIOS
      </span>
    </span>
  );
}
