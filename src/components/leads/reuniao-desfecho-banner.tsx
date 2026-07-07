"use client";

import { CalendarClock, Check, Loader2, PhoneMissed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Banner no topo do detalhe do lead quando há reunião passada sem desfecho:
// a reunião ou aconteceu ou não — de qualquer forma o lead precisa mudar de
// estágio. Mesmo objetivo do card da Mesa, com espaço pra um feedback curto.

type Props = {
  reuniaoId: string;
  quando: string; // "terça-feira, 01/07 às 14:00"
};

export function ReuniaoDesfechoBanner({ reuniaoId, quando }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [resolvido, setResolvido] = useState(false);

  async function desfecho(resultado: "realizada" | "no_show") {
    setPending(resultado);
    const res = await fetch(`/api/reunioes/${reuniaoId}/desfecho`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resultado,
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      }),
    });
    setPending(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Não deu certo", { description: json.error ?? "Tente de novo." });
      return;
    }
    toast.success(
      resultado === "realizada"
        ? "Reunião registrada como realizada."
        : "No-show registrado — resgate iniciado.",
    );
    setResolvido(true);
    startTransition(() => router.refresh());
  }

  if (resolvido) return null;

  return (
    <div className="surface-solid rounded-xl border-l-4 border-l-destructive p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-destructive" strokeWidth={1.75} />
        <p className="text-sm font-semibold">
          A reunião de {quando} precisa de desfecho
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ela aconteceu ou não — de qualquer forma, o lead precisa avançar de
        estágio. O registro abaixo já faz isso por você.
      </p>
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <Input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Feedback curto da reunião (opcional)"
          className="h-8 text-sm max-w-xs"
          maxLength={500}
        />
        <Button
          size="sm"
          disabled={!!pending}
          onClick={() => void desfecho("realizada")}
          className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
        >
          {pending === "realizada" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Realizada
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!pending}
          onClick={() => void desfecho("no_show")}
        >
          {pending === "no_show" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <PhoneMissed className="size-3.5" />
          )}
          Não aconteceu
        </Button>
      </div>
    </div>
  );
}
