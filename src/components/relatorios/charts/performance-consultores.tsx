import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PerformanceConsultorRow } from "@/lib/reports/queries";

export function PerformanceConsultoresTable({
  rows,
}: {
  rows: PerformanceConsultorRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Performance por consultor</CardTitle>
        <CardDescription>
          Leads atribuídos no período, taxa de fechamento e tempo médio até primeiro contato.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-8 text-center">
            Sem consultores ativos no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Consultor</th>
                  <th className="px-2 py-2 font-medium text-right">Atribuídos</th>
                  <th className="px-2 py-2 font-medium text-right">Fechados</th>
                  <th className="px-2 py-2 font-medium text-right">Taxa</th>
                  <th className="px-2 py-2 font-medium text-right">1º contato (min)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.consultorId} className="border-b">
                    <td className="px-2 py-2 font-medium">{r.consultorNome}</td>
                    <td className="px-2 py-2 text-right">{r.leadsAtribuidos}</td>
                    <td className="px-2 py-2 text-right">{r.fechados}</td>
                    <td className="px-2 py-2 text-right">
                      {r.leadsAtribuidos > 0
                        ? `${(r.taxaFechamento * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r.primeiroContatoMinAvg != null
                        ? r.primeiroContatoMinAvg.toFixed(0)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
