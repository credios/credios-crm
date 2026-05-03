import { ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";

import { BlocoCarteiraEmRisco } from "@/components/minha-mesa/bloco-carteira-em-risco";
import { BlocoNovosParaMim } from "@/components/minha-mesa/bloco-novos-para-mim";
import { FilaFazerAgora } from "@/components/minha-mesa/fila-fazer-agora";
import { MiniPlacar } from "@/components/minha-mesa/mini-placar";
import { getAppUser } from "@/lib/auth/get-app-user";
import {
  getCarteiraEmRisco,
  getFilaFazerAgora,
  getMiniPlacar,
  getNovosParaMim,
} from "@/lib/minha-mesa/queries";

export const revalidate = 30;
export const maxDuration = 30;

export default async function MinhaMesaPage() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  // Marketing não atende leads — manda direto pra /leads (sua home natural)
  // em vez de bloquear com /sem-permissao. Login default vira /minha-mesa,
  // então marketing logando cai aqui e segue pra /leads transparente.
  if (user.perfil === "marketing") redirect("/leads");

  const [placar, fila, novos, risco] = await Promise.all([
    getMiniPlacar(user.id),
    getFilaFazerAgora(user.id),
    getNovosParaMim(user.id),
    getCarteiraEmRisco(user.id),
  ]);

  const primeiroNome = user.nome.split(" ")[0] || user.nome;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <ClipboardList
              className="size-6 text-primary"
              strokeWidth={1.75}
            />
            Minha mesa
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {greeting()}, <span className="font-medium text-foreground">{primeiroNome}</span>.
            Aqui está o que precisa da sua atenção agora.
          </p>
        </div>
      </div>

      <MiniPlacar data={placar} />

      <FilaFazerAgora items={fila} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BlocoNovosParaMim items={novos} />
        <BlocoCarteiraEmRisco items={risco} />
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  });
  const hour = Number(h);
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
