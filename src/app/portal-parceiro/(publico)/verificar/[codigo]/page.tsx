import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

import { verificarPorCodigo } from "@/lib/portal-parceiro/contrato/servico";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificar contrato" };

type Props = { params: Promise<{ codigo: string }> };

const fmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

// Conferência pública de autenticidade. Mostra só o que prova que o documento
// existe e quem assinou — documento mascarado, sem contato nem texto do contrato.
export default async function VerificarCodigoPage({ params }: Props) {
  const { codigo } = await params;
  const c = await verificarPorCodigo(decodeURIComponent(codigo));

  if (!c) {
    return (
      <div className="space-y-3 text-center">
        <XCircle className="mx-auto size-10 text-destructive" aria-hidden />
        <h1 className="text-lg font-semibold">Contrato não encontrado</h1>
        <p className="text-sm text-muted-foreground">
          Não há contrato assinado com este código. Confira se digitou corretamente.
        </p>
        <Link href="/portal-parceiro/verificar" className="text-sm text-primary hover:underline">
          Tentar outro código
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
        <h1 className="mt-2 text-lg font-semibold">Contrato autêntico</h1>
        <p className="text-sm text-muted-foreground">Código {c.codigo}</p>
      </div>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Documento</dt>
          <dd>Contrato de Parceria Comercial — Programa de Parceiros Credios</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Parceiro</dt>
          <dd>{c.parceiro} · {c.documentoMascarado}</dd>
        </div>
        {c.assinadoEm && (
          <div>
            <dt className="text-xs text-muted-foreground">Assinado pelo parceiro</dt>
            <dd>{fmt.format(c.assinadoEm)} (horário de Brasília)</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">Assinatura da Credios</dt>
          <dd>
            {c.crediosAssinadoEm
              ? `${fmt.format(c.crediosAssinadoEm)}${c.crediosAssinanteNome ? ` · ${c.crediosAssinanteNome}` : ""}`
              : "Pendente"}
          </dd>
        </div>
        {c.hashDocumento && (
          <div>
            <dt className="text-xs text-muted-foreground">SHA-256 da via final</dt>
            <dd className="break-all font-mono text-xs">{c.hashDocumento}</dd>
          </div>
        )}
      </dl>
      <p className="text-xs text-muted-foreground">
        Para conferir um arquivo, calcule o SHA-256 do PDF e compare com o valor acima.
      </p>
    </div>
  );
}
