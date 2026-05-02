"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { EmptyAudit } from "@/components/shared/illustrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTimeBr } from "@/lib/formatters/date";

const RECURSO_TIPOS = [
  "lead",
  "usuario",
  "regra_roteamento",
  "mensagem_template",
  "sla_alertas",
  "sessao",
];

type AuditEntry = {
  id: string;
  acao: string;
  recursoTipo: string | null;
  recursoId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  criadoEm: string;
  usuarioId: string | null;
  usuarioNome: string | null;
  usuarioEmail: string | null;
};

type Props = {
  consultores: { id: string; nome: string }[];
  initial: {
    data: AuditEntry[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  };
};

export function AuditPageClient({ consultores, initial }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [acaoLocal, setAcaoLocal] = useState(params.get("acao") ?? "");

  // Debounced sync de busca de ação.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (acaoLocal) next.set("acao", acaoLocal);
      else next.delete("acao");
      next.delete("page");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acaoLocal]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "") next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function clearAll() {
    setAcaoLocal("");
    startTransition(() => router.replace(pathname));
  }

  function goPage(page: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(page));
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  const hasFilters = ["usuarioId", "acao", "recursoTipo", "dataDe", "dataAte"].some(
    (k) => params.has(k),
  );

  const { data, pagination } = initial;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Buscar ação</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={acaoLocal}
                onChange={(e) => setAcaoLocal(e.currentTarget.value)}
                placeholder="ex: lead_, login, mfa"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Usuário</Label>
            <Select
              value={params.get("usuarioId") ?? "__all__"}
              onValueChange={(v) =>
                setParam("usuarioId", v === "__all__" ? null : v ?? null)
              }
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) => {
                    if (typeof v !== "string" || v === "__all__")
                      return <span className="text-muted-foreground">Todos</span>;
                    return consultores.find((c) => c.id === v)?.nome ?? v.slice(0, 8);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {consultores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de recurso</Label>
            <Select
              value={params.get("recursoTipo") ?? "__all__"}
              onValueChange={(v) =>
                setParam("recursoTipo", v === "__all__" ? null : v ?? null)
              }
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) =>
                    typeof v === "string" && v !== "__all__" ? (
                      v
                    ) : (
                      <span className="text-muted-foreground">Todos</span>
                    )
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {RECURSO_TIPOS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <div className="flex gap-1">
              <Input
                type="date"
                value={params.get("dataDe") ?? ""}
                onChange={(e) => setParam("dataDe", e.currentTarget.value || null)}
              />
              <Input
                type="date"
                value={params.get("dataAte") ?? ""}
                onChange={(e) => setParam("dataAte", e.currentTarget.value || null)}
              />
            </div>
          </div>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="size-3.5" /> Limpar filtros
          </Button>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <Th>Quando</Th>
                <Th>Usuário</Th>
                <Th>Ação</Th>
                <Th>Recurso</Th>
                <Th>Metadata</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      illustration={<EmptyAudit />}
                      title="Nenhum evento encontrado"
                      description={
                        hasFilters
                          ? "Os filtros atuais não retornaram nada — tente alargar o período ou limpar."
                          : "A trilha de auditoria está silenciosa por enquanto. Eventos aparecem aqui em tempo real."
                      }
                    />
                  </td>
                </tr>
              ) : (
                data.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {formatDateTimeBr(e.criadoEm)}
                    </td>
                    <td className="px-3 py-2">
                      {e.usuarioNome ? (
                        <div>
                          <p className="text-sm">{e.usuarioNome}</p>
                          <p className="text-xs text-muted-foreground">{e.usuarioEmail}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">sistema</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <code className="text-xs rounded bg-muted px-1.5 py-0.5">{e.acao}</code>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {e.recursoTipo ? (
                        e.recursoTipo === "lead" && e.recursoId ? (
                          <Link
                            href={`/leads/${e.recursoId}`}
                            prefetch={false}
                            className="text-primary hover:underline"
                          >
                            lead/{e.recursoId.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {e.recursoTipo}
                            {e.recursoId ? `/${e.recursoId.slice(0, 8)}` : ""}
                          </span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[280px]">
                      {e.metadata ? (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            ver
                          </summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] bg-muted p-2 rounded">
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {e.ip ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {pagination.total} eventos
          {pagination.totalPages > 1 && (
            <> · página {pagination.page} de {pagination.totalPages}</>
          )}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => goPage(pagination.page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => goPage(pagination.page + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  );
}
