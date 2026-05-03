"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type Props = {
  /** Fallback se não houver histórico no navegador (cold open via link). */
  fallbackHref?: string;
  label?: string;
  className?: string;
};

/**
 * Botão "Voltar" que usa router.back() — preserva a página de origem com
 * filtros/scroll position. Em cold open (deep link de email, copiar URL,
 * abrir nova aba), `window.history.length` é 1 e caímos pro fallbackHref
 * via router.push.
 *
 * Padrão default fallback: /minha-mesa (home pós-login).
 *
 * Decisão é feita no onClick (não no render) pra evitar hydration mismatch
 * e pra não precisar de useState/useEffect.
 */
export function BackButton({
  fallbackHref = "/minha-mesa",
  label = "Voltar",
  className,
}: Props) {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={className}
    >
      <ArrowLeft className="size-4" /> {label}
    </Button>
  );
}
