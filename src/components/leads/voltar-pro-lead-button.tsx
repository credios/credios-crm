"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * Botão "Voltar pro lead" da página de simulação (PDF).
 *
 * Por que NÃO é um `<Link href="/leads/[id]">`?
 *   O Link cria uma entrada nova no histórico do browser. Combinado com
 *   o BackButton do detalhe (que faz router.back()), o usuário fica em
 *   loop: voltar do lead retorna pra simulação.
 *
 * Comportamento por contexto:
 *
 *   1. ABA NOVA (browser comum): window.opener existe pq foi aberta via
 *      window.open() do card de simulação. Fechar a aba é o ideal — a
 *      aba ORIGINAL já está em /leads/[id], então a navegação subsequente
 *      do consultor (botão Voltar do header) sai direto pra /leads ou
 *      kanban, sem passar pela simulação que ele já "encerrou".
 *
 *   2. MESMA JANELA (PWA, ou browser quando isStandalonePwa() detectou):
 *      o histórico tem [...origem, /leads/[id], /leads/[id]/proposta].
 *      router.back() volta pra /leads/[id] SEM adicionar nova entrada.
 *      Quando o consultor depois aperta o BackButton do header, ele
 *      vai pra origem (lista, kanban, minha-mesa) — não pra simulação.
 *
 *   3. SEM HISTÓRICO (deep link colado de email, ou hard reload da
 *      própria simulação): window.history.length === 1. Fallback é
 *      router.push("/leads/[id]") — único caso que cria entrada nova,
 *      e mesmo assim só uma (pra entrar no lead).
 */
export function VoltarProLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();

  function handleClick() {
    if (typeof window === "undefined") return;

    // 1. Aba nova aberta via window.open → fechar é o melhor UX.
    //    Verificamos !closed pra evitar TypeError raro em alguns browsers.
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }

    // 2. Mesma janela com histórico → volta sem poluir.
    if (window.history.length > 1) {
      router.back();
      return;
    }

    // 3. Sem histórico (deep link) → navegação normal.
    router.push(`/leads/${leadId}`);
  }

  return (
    <Button variant="outline" onClick={handleClick}>
      <ArrowLeft className="size-4" />
      Voltar pro lead
    </Button>
  );
}
