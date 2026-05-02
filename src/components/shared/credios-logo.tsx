// Logotipo oficial Credios (mesmo asset do site institucional).
// PNG azul; em dark mode aplicamos `brightness-0 invert` pra virar branco —
// é o mesmo truque que o site usa em fundos escuros (Navbar.tsx do site).
//
// O subtítulo "CRM" abaixo do logo é renderizado pelos callers (sidebar /
// drawer / header / login), porque alguns o omitem (ex: header mobile).

import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /**
   * Tamanho do lockup. Mapeia altura em px (largura calculada na proporção
   * 200:64 do asset original):
   *  - sm: 20px (header mobile)
   *  - md: 28px (sidebar / drawer)
   *  - lg: 40px (login)
   */
  size?: "sm" | "md" | "lg";
};

const HEIGHT_MAP: Record<NonNullable<LogoProps["size"]>, number> = {
  sm: 20,
  md: 28,
  lg: 40,
};

// Proporção do asset oficial (mesmo width/height usado no site em
// credios-website-v2/src/components/layout/Navbar.tsx).
const ASPECT = 200 / 64;

export function CrediosLogo({ className, size = "md" }: LogoProps) {
  const h = HEIGHT_MAP[size];
  const w = Math.round(h * ASPECT);
  return (
    <Image
      src="/credios-logo.png"
      alt="Credios"
      width={w}
      height={h}
      priority
      className={cn(
        "object-contain dark:brightness-0 dark:invert",
        className,
      )}
    />
  );
}
