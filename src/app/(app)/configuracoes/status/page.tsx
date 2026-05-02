import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { StatusConfigList } from "@/components/configuracoes/status-config-list";
import { Button } from "@/components/ui/button";
import { listAllStatuses } from "@/lib/status/queries";

export const dynamic = "force-dynamic";

export default async function StatusConfigPage() {
  const statuses = await listAllStatuses();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={
            <Link href="/configuracoes">
              <ArrowLeft className="size-4" /> Configurações
            </Link>
          }
        />
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
            Status do funil
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
            Reordene arrastando, edite o nome ou crie status custom. Status do
            sistema (badge dourado) não podem ser excluídos — só desativados.
            Quando você desativa ou exclui, leads no status removido caem no
            status anterior do funil.
          </p>
        </div>
      </div>
      <StatusConfigList initial={statuses} />
    </div>
  );
}
