import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { ContratoAssinar, RepresentanteForm } from "@/components/portal-parceiro/contrato-assinar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  contratosDoParceiro,
  garantirContratoPendente,
  precisaAssinarContrato,
} from "@/lib/portal-parceiro/contrato/servico";
import { exigirParceiro } from "@/lib/portal-parceiro/sessao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contrato" };

type Props = { searchParams: Promise<{ assinado?: string }> };

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export default async function ContratoPage({ searchParams }: Props) {
  const sessao = await exigirParceiro();
  const precisa = await precisaAssinarContrato(sessao.parceiroId, sessao.produtosHabilitados);

  if (precisa) {
    const pendente = await garantirContratoPendente(sessao.parceiroId);
    if (!pendente.ok) {
      return (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
            Contrato de parceria
          </h1>
          {pendente.faltaRepresentante ? (
            <>
              <p className="max-w-xl text-sm text-muted-foreground">
                Seu cadastro é de pessoa jurídica. Antes de gerar o contrato, informe quem
                assina pela empresa.
              </p>
              <RepresentanteForm nomeSugerido={sessao.nome} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{pendente.erro}</p>
          )}
        </>
      );
    }

    return (
      <>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
            Assine seu contrato de parceria
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Leia o contrato com calma. Para assinar, você confirma um código enviado ao seu
            e-mail. Depois disso já pode indicar clientes.
          </p>
        </div>
        {/* Texto gerado pelo próprio sistema a partir do modelo; os dados do
            parceiro entram escapados (mescla.ts). Página inteira, sem rolagem
            interna: a barra de assinatura fica presa embaixo. */}
        <article
          className="rounded-xl border bg-card p-5 text-sm leading-relaxed sm:p-8 [&_h1]:mb-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:font-semibold [&_p]:mb-3"
          dangerouslySetInnerHTML={{ __html: pendente.corpoHtml }}
        />
        <p className="text-xs text-muted-foreground">
          Código de verificação do documento: {pendente.codigo}
        </p>
        <ContratoAssinar
          contratoId={pendente.id}
          email={sessao.email}
          jaVerificado={pendente.otpVerificado}
        />
      </>
    );
  }

  const { assinado } = await searchParams;
  const contratos = (await contratosDoParceiro(sessao.parceiroId)).filter(
    (c) => c.status === "assinado_parceiro" || c.status === "concluido",
  );

  return (
    <>
      {assinado === "1" && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950">
          <CheckCircle2 className="size-8 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Contrato assinado. Seu acesso está liberado.</p>
            <p className="text-sm text-muted-foreground">
              A Credios assina em seguida e você recebe a via final por e-mail.
            </p>
          </div>
          <Link href="/portal-parceiro/clientes/novo" className={buttonVariants({})}>
            Indicar meu primeiro cliente
          </Link>
        </div>
      )}
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Contrato de parceria</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seus contratos</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {contratos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.status === "concluido"
                      ? "Assinado pelas duas partes"
                      : "Assinado por você — aguardando a assinatura da Credios"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Código {c.codigoVerificacao}
                    {c.assinadoEm ? ` · assinado em ${fmtData.format(c.assinadoEm)}` : ""}
                  </p>
                </div>
                <a
                  href={`/api/portal-parceiro/contrato/${c.id}/pdf`}
                  className="text-primary hover:underline"
                >
                  {c.status === "concluido" ? "Baixar via final (PDF)" : "Baixar o contrato (PDF)"}
                </a>
              </li>
            ))}
          </ul>
          {contratos.some((c) => c.status !== "concluido") && (
            <p className="mt-3 text-xs text-muted-foreground">
              A via final, com as duas assinaturas e a trilha de auditoria, fica disponível
              aqui e chega por e-mail assim que a Credios assinar.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
