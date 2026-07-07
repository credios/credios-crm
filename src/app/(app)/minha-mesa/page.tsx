import { ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";

import { BlocoCarteiraEmRisco } from "@/components/minha-mesa/bloco-carteira-em-risco";
import { BlocoFaxina } from "@/components/minha-mesa/bloco-faxina";
import { BlocoNovosParaMim } from "@/components/minha-mesa/bloco-novos-para-mim";
import { BlocoProximasReunioes } from "@/components/minha-mesa/bloco-proximas-reunioes";
import { BlocoSolicitacoesScore } from "@/components/minha-mesa/bloco-solicitacoes-score";
import { FilaFazerAgora } from "@/components/minha-mesa/fila-fazer-agora";
import { MiniPlacar } from "@/components/minha-mesa/mini-placar";
import { ConsultorPicker } from "@/components/relatorios/consultor-picker";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdminOrGerente } from "@/lib/auth/permissions";
import { fetchConsultoresAtivos } from "@/lib/reports/queries";
import {
  getCarteiraEmRisco,
  getFaxina,
  getFilaFazerAgora,
  getMiniPlacar,
  getNovosParaMim,
  getProximasReunioes,
  getSolicitacoesScorePendentes,
} from "@/lib/minha-mesa/queries";

export const revalidate = 30;
export const maxDuration = 30;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MinhaMesaPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  // Marketing não atende leads — manda direto pra /leads (sua home natural)
  // em vez de bloquear com /sem-permissao. Login default vira /minha-mesa,
  // então marketing logando cai aqui e segue pra /leads transparente.
  if (user.perfil === "marketing") redirect("/leads");

  // Admin/gerente pode espiar a mesa de qualquer consultor (?consultor=id) em
  // MODO LEITURA: os botões de ação somem — supervisão sem risco de clique.
  const raw = await searchParams;
  const requestedId =
    typeof raw.consultor === "string" && raw.consultor ? raw.consultor : null;
  const podeVerOutros = isAdminOrGerente(user);
  const consultorVisualizadoId =
    podeVerOutros && requestedId ? requestedId : user.id;
  const somenteLeitura = consultorVisualizadoId !== user.id;
  const consultores = podeVerOutros ? await fetchConsultoresAtivos() : [];
  const visualizado =
    consultores.find((c) => c.id === consultorVisualizadoId) ?? {
      id: user.id,
      nome: user.nome,
    };

  const [placar, fila, novos, risco, faxina, reunioes, solicitacoesScore] =
    await Promise.all([
      getMiniPlacar(consultorVisualizadoId),
      getFilaFazerAgora(consultorVisualizadoId),
      getNovosParaMim(consultorVisualizadoId),
      getCarteiraEmRisco(consultorVisualizadoId),
      getFaxina(consultorVisualizadoId),
      getProximasReunioes(consultorVisualizadoId),
      // Fila de aprovação do admin — global, independe da mesa visualizada.
      user.perfil === "admin" ? getSolicitacoesScorePendentes() : Promise.resolve([]),
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
            {somenteLeitura ? (
              <>
                Você está vendo a mesa de{" "}
                <span className="font-medium text-foreground">{visualizado.nome}</span>{" "}
                — <span className="font-medium text-amber-600">somente leitura</span>.
              </>
            ) : (
              <>
                {greeting()}, <span className="font-medium text-foreground">{primeiroNome}</span>.
                Aqui está o que precisa da sua atenção agora.
              </>
            )}
          </p>
        </div>
        {podeVerOutros && consultores.length > 0 && (
          <ConsultorPicker
            consultores={consultores}
            currentId={consultorVisualizadoId}
            selfId={user.id}
          />
        )}
      </div>

      <MiniPlacar data={placar} />

      {user.perfil === "admin" && <BlocoSolicitacoesScore items={solicitacoesScore} />}

      <BlocoProximasReunioes items={reunioes} />

      {/* Faxina primeiro enquanto houver backlog — é o trabalho de onboarding
          do playbook; some sozinha quando drenar. */}
      <BlocoFaxina data={faxina} readOnly={somenteLeitura} />

      <FilaFazerAgora items={fila} readOnly={somenteLeitura} />

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
