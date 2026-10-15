import "server-only";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

// Seções de /relatorios e /admin/painel-executivo: cada uma busca os próprios
// dados dentro de um Suspense. Este helper dá às duas páginas:
//   - timeout por seção (uma query presa não deixa skeleton infinito);
//   - erro isolado (a seção some com aviso, o resto da página segue);
//   - medição: uma linha `[perf]` em JSON por seção, nos logs da Vercel.
//
// Por que log e não Server-Timing: a página faz streaming — os headers saem
// antes das seções terminarem, então não dá pra pôr o tempo delas no header.
// Pra ler: Vercel → Logs, filtrar por `"perf":"/relatorios"`.

const SECTION_TIMEOUT_MS = 25_000;

export async function renderSection(
  rota: string,
  name: string,
  fn: () => Promise<ReactNode>,
): Promise<ReactNode> {
  const inicio = performance.now();
  let status: "ok" | "erro" | "timeout" = "ok";
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          status = "timeout";
          reject(
            new Error(`section "${name}" timed out after ${SECTION_TIMEOUT_MS}ms`),
          );
        }, SECTION_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (status === "ok") status = "erro";
    console.error(`[${rota}:${name}]`, error);
    return <SectionError title={name} />;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    console.log(
      JSON.stringify({
        perf: rota,
        secao: name,
        ms: Math.round(performance.now() - inicio),
        status,
      }),
    );
  }
}

function SectionError({ title }: { title: string }) {
  return (
    <div className="surface-solid rounded-xl border-destructive/25 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-destructive/10 p-2">
          <AlertTriangle className="size-4 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-sm font-semibold">
            {title} indisponível
          </h2>
          <p className="text-xs text-muted-foreground">
            Esta seção falhou ao carregar, mas o restante da página continua
            disponível. Recarregue a página para tentar novamente.
          </p>
        </div>
      </div>
    </div>
  );
}
