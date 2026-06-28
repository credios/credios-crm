import { MessageSquare } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type WhatsappMensagem = {
  id: string;
  tipo: string; // whatsapp_recebido (cliente) | whatsapp_enviado (Heloísa)
  conteudo: string | null;
  criadoEm: string; // ISO
  entrega?: string | null; // delivered | read | failed (status do Meta)
};

function horario(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function entregaLabel(e: string): string {
  if (e === "read") return "✓✓ lido";
  if (e === "delivered") return "✓✓ entregue";
  if (e === "failed") return "⚠️ não entregue";
  return "";
}

/**
 * Conversa de WhatsApp (Heloísa ↔ cliente) renderizada como chat — somente
 * leitura. Resolve o ponto cego do Kommo, que mostra só as mensagens do cliente:
 * aqui aparecem as DUAS pontas (recebidas + enviadas pela IA), na ordem real.
 */
export function LeadWhatsappConversa({ mensagens }: { mensagens: WhatsappMensagem[] }) {
  if (mensagens.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
          Conversa no WhatsApp
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {mensagens.length} {mensagens.length === 1 ? "mensagem" : "mensagens"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
          {mensagens.map((m) => {
            const daHeloisa = m.tipo === "whatsapp_enviado";
            return (
              <div
                key={m.id}
                className={`flex ${daHeloisa ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
                    daHeloisa
                      ? "rounded-br-sm bg-credios-blue/10"
                      : "rounded-bl-sm bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                  <p
                    className={`mt-1 text-[10px] text-muted-foreground ${
                      daHeloisa ? "text-right" : ""
                    }`}
                  >
                    {daHeloisa ? "Heloísa" : "Cliente"} · {horario(m.criadoEm)}
                    {daHeloisa && m.entrega ? (
                      <>
                        {" · "}
                        <span
                          className={
                            m.entrega === "failed" ? "font-medium text-red-600" : ""
                          }
                        >
                          {entregaLabel(m.entrega)}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
