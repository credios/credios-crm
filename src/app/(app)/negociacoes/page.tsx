import { Handshake } from "lucide-react";
import { redirect } from "next/navigation";

import { ConsultorFilter } from "@/components/negociacoes/consultor-filter";
import { NegociacoesBoard } from "@/components/negociacoes/negociacoes-board";
import { getAppUser } from "@/lib/auth/get-app-user";
import { isAdmin } from "@/lib/auth/permissions";
import { listConsultoresAtivos } from "@/lib/leads/list-leads";
import { getNegociacoesAbertas } from "@/lib/negociacoes/queries";

export const revalidate = 30;
export const maxDuration = 30;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NegociacoesPage({ searchParams }: Props) {
  const user = await getAppUser();
  if (!user) redirect("/login");
  // Marketing não atende leads — manda pra /leads (igual à Minha mesa).
  if (user.perfil === "marketing") redirect("/leads");

  const admin = isAdmin(user);
  const raw = await searchParams;
  const consultorParam =
    typeof raw.consultor === "string" ? raw.consultor : undefined;

  // Escopo: só admin pode ver outros consultores. Demais perfis SEMPRE veem
  // apenas as próprias negociações (enforced aqui no servidor, não dá pra
  // burlar via querystring).
  //   - "meus" (default) → as do próprio usuário
  //   - "todos"          → null (todos os consultores)
  //   - <consultorId>    → as daquele consultor
  let scopeConsultorId: string | null = user.id;
  if (admin && consultorParam && consultorParam !== "meus") {
    scopeConsultorId = consultorParam === "todos" ? null : consultorParam;
  }

  const [items, consultores] = await Promise.all([
    getNegociacoesAbertas(scopeConsultorId),
    admin ? listConsultoresAtivos().catch(() => []) : Promise.resolve([]),
  ]);

  // Valor selecionado no seletor (pra refletir a URL).
  const selecionado =
    admin && consultorParam && consultorParam !== "meus" ? consultorParam : "meus";
  // Mostra o consultor dono em cada card só quando a visão mistura donos (todos).
  const mostrarConsultor = scopeConsultorId === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] flex items-center gap-2">
            <Handshake className="size-6 text-primary" strokeWidth={1.75} />
            Em negociação
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mostrarConsultor
              ? "Negociações de todos os consultores — os leads na reta final."
              : "Seus leads na reta final — os de maior chance de fechar. Mantenha o contato diário e acompanhe o andamento com o cliente e com os bancos."}
          </p>
        </div>
        {admin && (
          <ConsultorFilter consultores={consultores} value={selecionado} />
        )}
      </div>

      <NegociacoesBoard items={items} mostrarConsultor={mostrarConsultor} />
    </div>
  );
}
