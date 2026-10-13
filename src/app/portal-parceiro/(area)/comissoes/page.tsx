import { Card, CardContent } from "@/components/ui/card";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import { COMISSAO_STATUS_LABEL, type ComissaoStatus } from "@/lib/parceiros/constants";
import { listarComissoes, resumoDoParceiro } from "@/lib/portal-parceiro/indicacoes";
import { exigirParceiro } from "@/lib/portal-parceiro/sessao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comissões" };

function dataBr(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export default async function ComissoesPage() {
  const sessao = await exigirParceiro();
  const [comissoes, resumo] = await Promise.all([
    listarComissoes(sessao.parceiroId),
    resumoDoParceiro(sessao.parceiroId),
  ]);

  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Comissões</h1>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{formatBrlFromCents(resumo.aReceberCentavos)}</p>
            <p className="text-xs text-muted-foreground">A receber</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-semibold tabular-nums">{formatBrlFromCents(resumo.recebidoCentavos)}</p>
            <p className="text-xs text-muted-foreground">Recebido</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          {comissoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma comissão registrada ainda. Ela aparece aqui quando o crédito de um
              cliente indicado é liberado.
            </p>
          ) : (
            <ul className="divide-y">
              {comissoes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.clienteNome ?? c.descricao ?? "Comissão"}</p>
                    <p className="text-xs text-muted-foreground">
                      {COMISSAO_STATUS_LABEL[c.status as ComissaoStatus] ?? c.status}
                      {c.pagoEm ? ` em ${dataBr(c.pagoEm)}` : ""}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">{formatBrlFromCents(c.valorCentavos)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
