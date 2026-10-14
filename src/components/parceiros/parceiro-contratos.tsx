"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Confirmar } from "@/components/shared/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Contratos de parceria do parceiro na ficha do CRM. Admin only: baixa o PDF
// e contra-assina quando o parceiro já assinou.

const STATUS: Record<string, string> = {
  enviado: "Aguardando o parceiro",
  visualizado: "Parceiro abriu, não assinou",
  assinado_parceiro: "Assinado pelo parceiro",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export type ContratoRow = {
  id: string;
  versaoModelo: number;
  status: string;
  codigoVerificacao: string;
  assinadoEm: string | null;
  crediosAssinadoEm: string | null;
};

export function ParceiroContratos({
  parceiroId,
  contratos,
}: {
  parceiroId: string;
  contratos: ContratoRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function chamar(c: ContratoRow, acao: "contra-assinar" | "cancelar") {
    setBusy(true);
    try {
      const res = await fetch(`/api/parceiros/${parceiroId}/contratos/${c.id}/${acao}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aceito: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Não consegui concluir.");
        throw new Error("falhou");
      }
      toast.success(
        acao === "cancelar"
          ? "Contrato cancelado."
          : "Contrato concluído. A via final foi enviada por e-mail às duas partes.",
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contrato de parceria</CardTitle>
      </CardHeader>
      <CardContent>
        {contratos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum contrato ainda. Ele é gerado quando o parceiro entra no portal pela
            primeira vez.
          </p>
        ) : (
          <ul className="divide-y">
            {contratos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    Modelo v{c.versaoModelo}{" "}
                    <Badge variant={c.status === "concluido" ? "default" : "outline"} className="ml-1">
                      {STATUS[c.status] ?? c.status}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.codigoVerificacao}
                    {c.assinadoEm ? ` · parceiro em ${c.assinadoEm}` : ""}
                    {c.crediosAssinadoEm ? ` · Credios em ${c.crediosAssinadoEm}` : ""}
                  </p>
                </div>
                {c.status !== "cancelado" && (
                  <a
                    href={`/api/parceiros/${parceiroId}/contratos/${c.id}/pdf`}
                    className="text-primary hover:underline"
                  >
                    PDF
                  </a>
                )}
                {c.status === "assinado_parceiro" && (
                  <Confirmar
                    titulo="Assinar pela Credios?"
                    descricao="Confirme que você leu este contrato (baixe o PDF se ainda não leu). Ao assinar, o sistema gera a via final com as duas assinaturas e a envia por e-mail ao parceiro e a você."
                    rotulo="Assinar pela Credios"
                    onConfirmar={() => chamar(c, "contra-assinar")}
                  >
                    {(abrir) => (
                      <Button size="sm" disabled={busy} onClick={abrir}>
                        Contra-assinar
                      </Button>
                    )}
                  </Confirmar>
                )}
                {["enviado", "visualizado", "assinado_parceiro"].includes(c.status) && (
                  <Confirmar
                    titulo="Cancelar este contrato?"
                    descricao="Use quando houver dado errado no cadastro. O parceiro precisará ler e assinar um novo contrato antes de voltar a indicar clientes."
                    rotulo="Cancelar contrato"
                    destrutivo
                    onConfirmar={() => chamar(c, "cancelar")}
                  >
                    {(abrir) => (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={abrir}>
                        Cancelar
                      </Button>
                    )}
                  </Confirmar>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
