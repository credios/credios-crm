import { headers } from "next/headers";

import { ContratoAssinar } from "@/components/portal-parceiro/contrato-assinar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  contratosDoParceiro,
  garantirContratoPendente,
  precisaAssinarContrato,
  registrarVisualizacao,
} from "@/lib/portal-parceiro/contrato/servico";
import { exigirParceiro } from "@/lib/portal-parceiro/sessao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contrato" };

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const STATUS: Record<string, string> = {
  assinado_parceiro: "Assinado por você — aguardando a assinatura da Credios",
  concluido: "Concluído — assinado pelas duas partes",
};

export default async function ContratoPage() {
  const sessao = await exigirParceiro();
  const precisa = await precisaAssinarContrato(sessao.parceiroId, sessao.produtosHabilitados);

  if (precisa) {
    const pendente = await garantirContratoPendente(sessao.parceiroId);
    if (!pendente.ok) {
      return (
        <>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Contrato de parceria</h1>
          <p className="text-sm text-muted-foreground">{pendente.erro}</p>
        </>
      );
    }
    const h = await headers();
    await registrarVisualizacao(pendente.id, {
      ip: h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
    });

    return (
      <>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
            Falta assinar seu contrato
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Para indicar clientes e acompanhar comissões, leia e assine o contrato de
            parceria. A confirmação é feita por um código enviado ao seu e-mail.
          </p>
        </div>
        {/* Texto gerado pelo próprio sistema a partir do modelo; os dados do
            parceiro entram escapados (mescla.ts). */}
        <article
          className="max-h-[60vh] overflow-y-auto rounded-xl border bg-card p-6 text-sm leading-relaxed [&_h1]:mb-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:font-semibold [&_p]:mb-3"
          dangerouslySetInnerHTML={{ __html: pendente.corpoHtml }}
        />
        <p className="text-xs text-muted-foreground">
          Código de verificação do documento: {pendente.codigo}
        </p>
        <ContratoAssinar email={sessao.email} jaVerificado={pendente.otpVerificado} />
      </>
    );
  }

  const contratos = (await contratosDoParceiro(sessao.parceiroId)).filter(
    (c) => c.status === "assinado_parceiro" || c.status === "concluido",
  );

  return (
    <>
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
                  <p className="font-medium">{STATUS[c.status] ?? c.status}</p>
                  <p className="text-xs text-muted-foreground">
                    Código {c.codigoVerificacao}
                    {c.assinadoEm ? ` · assinado em ${fmtData.format(c.assinadoEm)}` : ""}
                  </p>
                </div>
                <a
                  href={`/api/portal-parceiro/contrato/${c.id}/pdf`}
                  className="text-primary hover:underline"
                >
                  {c.status === "concluido" ? "Baixar via final (PDF)" : "Baixar minuta (PDF)"}
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
