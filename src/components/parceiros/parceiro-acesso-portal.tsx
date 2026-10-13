"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Acesso do parceiro ao portal dentro do CRM (login próprio). Admin only.

const LABEL: Record<string, string> = {
  sem_acesso: "Sem acesso",
  convidado: "Convite enviado",
  ativo: "Ativo",
  suspenso: "Suspenso",
};

export function ParceiroAcessoPortal({
  parceiroId,
  acesso,
  temEmail,
  ultimoLogin,
}: {
  parceiroId: string;
  acesso: string;
  temEmail: boolean;
  ultimoLogin: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function agir(acao: "convidar" | "suspender" | "reativar", confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/parceiros/${parceiroId}/acesso-portal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) toast.error(json.error ?? "Não consegui concluir.");
      else {
        toast.success(
          acao === "convidar"
            ? "Convite enviado por e-mail."
            : acao === "suspender"
              ? "Acesso suspenso."
              : "Acesso reativado.",
        );
        router.refresh();
      }
    } catch {
      toast.error("Falha de conexão.");
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Acesso ao portal (novo)</CardTitle>
        <Badge variant={acesso === "ativo" ? "default" : "outline"}>
          {LABEL[acesso] ?? acesso}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {acesso === "sem_acesso" &&
            "O parceiro ainda não tem login. O convite manda um link para ele criar a senha."}
          {acesso === "convidado" && "Aguardando o parceiro criar a senha (link válido por 7 dias)."}
          {acesso === "ativo" &&
            (ultimoLogin ? `Último acesso em ${ultimoLogin}.` : "Senha criada; ainda não entrou.")}
          {acesso === "suspenso" && "Login bloqueado. Indicações e comissões seguem preservadas."}
        </p>
        <div className="flex flex-wrap gap-2">
          {acesso !== "suspenso" && (
            <Button
              size="sm"
              variant={acesso === "sem_acesso" ? "default" : "outline"}
              disabled={busy || !temEmail}
              onClick={() =>
                void agir(
                  "convidar",
                  acesso === "ativo"
                    ? "Enviar um link para o parceiro definir uma nova senha?"
                    : undefined,
                )
              }
            >
              {acesso === "sem_acesso"
                ? "Convidar para o portal"
                : acesso === "convidado"
                  ? "Reenviar convite"
                  : "Enviar link de nova senha"}
            </Button>
          )}
          {(acesso === "ativo" || acesso === "convidado") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void agir("suspender", "Suspender o acesso deste parceiro ao portal?")}
            >
              Suspender
            </Button>
          )}
          {acesso === "suspenso" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void agir("reativar")}>
              Reativar acesso
            </Button>
          )}
        </div>
        {!temEmail && (
          <p className="text-xs text-destructive">Cadastre o e-mail do parceiro para convidar.</p>
        )}
      </CardContent>
    </Card>
  );
}
