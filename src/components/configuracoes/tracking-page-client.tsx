"use client";

import { AlertCircle, CheckCircle2, Loader2, Power, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelative } from "@/lib/formatters/date";

type Source = {
  source: string;
  channel: string;
  paid: boolean;
  displayName: string;
  color: string | null;
  icon: string | null;
  ordem: number;
  ativo: boolean;
  leadCount: number;
};

type Unknown = {
  id: string;
  leadId: string | null;
  leadNome: string | null;
  rawOrigem: string | null;
  rawReferrer: string | null;
  rawUtmSource: string | null;
  rawUtmMedium: string | null;
  rawUtmCampaign: string | null;
  rawClickIds: Record<string, string | null> | null;
  createdAt: string;
};

type Alias = { alias: string; source: string };

export function TrackingPageClient({
  sources,
  unknowns,
  aliases,
}: {
  sources: Source[];
  unknowns: Unknown[];
  aliases: Alias[];
}) {
  const [tab, setTab] = useState<"sources" | "unknowns" | "aliases">(
    unknowns.length > 0 ? "unknowns" : "sources",
  );

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-foreground/10">
        <TabButton
          active={tab === "unknowns"}
          onClick={() => setTab("unknowns")}
          badge={unknowns.length || undefined}
        >
          Quarantine
        </TabButton>
        <TabButton active={tab === "sources"} onClick={() => setTab("sources")}>
          Sources ({sources.length})
        </TabButton>
        <TabButton active={tab === "aliases"} onClick={() => setTab("aliases")}>
          Aliases ({aliases.length})
        </TabButton>
      </div>

      {tab === "unknowns" && (
        <UnknownsTab unknowns={unknowns} sources={sources} />
      )}
      {tab === "sources" && <SourcesTab sources={sources} />}
      {tab === "aliases" && <AliasesTab aliases={aliases} sources={sources} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "relative -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
        (active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-mono font-medium text-destructive-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// UNKNOWNS TAB — quarantine de leads com origem desconhecida
// ============================================================================
function UnknownsTab({
  unknowns,
  sources,
}: {
  unknowns: Unknown[];
  sources: Source[];
}) {
  if (unknowns.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <CheckCircle2
            className="size-10 text-emerald-600 dark:text-emerald-400"
            strokeWidth={1.5}
          />
          <div className="space-y-1">
            <p className="font-display text-base font-semibold">
              Sem leads em quarantine
            </p>
            <p className="font-serif italic text-sm text-muted-foreground">
              Todos os leads chegaram com origem identificada.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-2">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
              strokeWidth={1.75}
            />
            <div>
              <CardTitle className="text-base">
                {unknowns.length} lead{unknowns.length === 1 ? "" : "s"} com
                origem não identificada
              </CardTitle>
              <CardDescription className="mt-1 leading-relaxed">
                Esses leads chegaram com utm_source/referrer não reconhecidos.
                Resolva mapeando para um source canônico (cria alias automático)
                ou criando um source novo.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-2">
        {unknowns.map((u) => (
          <UnknownCard key={u.id} unknown={u} sources={sources} />
        ))}
      </div>
    </div>
  );
}

function UnknownCard({ unknown, sources }: { unknown: Unknown; sources: Source[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [resolution, setResolution] = useState<string>("");
  const [pending, setPending] = useState(false);

  async function resolve() {
    if (!resolution) {
      toast.error("Selecione um source pra resolver");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/configuracoes/tracking/unknowns/${unknown.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolvedToSource: resolution }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Falha ao resolver", { description: json.error });
      return;
    }
    toast.success(`Resolvido como "${resolution}"`);
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            {unknown.leadId && (
              <Link
                href={`/leads/${unknown.leadId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {unknown.leadNome ?? "(lead sem nome)"}
              </Link>
            )}
            <p className="text-[11px] text-muted-foreground">
              chegou {formatRelative(unknown.createdAt)}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-y-1 text-xs sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-y-0.5">
          {unknown.rawUtmSource && (
            <KV label="utm_source" value={unknown.rawUtmSource} />
          )}
          {unknown.rawUtmMedium && (
            <KV label="utm_medium" value={unknown.rawUtmMedium} />
          )}
          {unknown.rawUtmCampaign && (
            <KV label="utm_campaign" value={unknown.rawUtmCampaign} />
          )}
          {unknown.rawReferrer && (
            <KV label="referrer" value={unknown.rawReferrer} />
          )}
          {unknown.rawOrigem && <KV label="origem (raw)" value={unknown.rawOrigem} />}
          {unknown.rawClickIds &&
            Object.entries(unknown.rawClickIds)
              .filter(([, v]) => Boolean(v))
              .slice(0, 3)
              .map(([k, v]) => <KV key={k} label={k} value={String(v).slice(0, 30)} />)}
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Resolver como source canônico:
            </p>
            <Select value={resolution} onValueChange={(v) => setResolution(v ?? "")}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione um source…" />
              </SelectTrigger>
              <SelectContent>
                {sources
                  .filter((s) => s.ativo)
                  .map((s) => (
                    <SelectItem key={s.source} value={s.source}>
                      <span className="inline-flex items-center gap-2">
                        <span className="text-muted-foreground">[{s.channel}]</span>
                        {s.displayName}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={resolve} disabled={!resolution || pending} size="sm">
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Resolver
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-mono">{value}</dd>
    </>
  );
}

// ============================================================================
// SOURCES TAB — listagem do catálogo + toggle ativo
// ============================================================================
function SourcesTab({ sources }: { sources: Source[] }) {
  // Agrupa por channel pra leitura.
  const byChannel = sources.reduce<Record<string, Source[]>>((acc, s) => {
    if (!acc[s.channel]) acc[s.channel] = [];
    acc[s.channel]!.push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byChannel).map(([channel, items]) => (
        <Card key={channel}>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {channel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {items.map((s) => (
              <SourceRow key={s.source} source={s} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SourceRow({ source }: { source: Source }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  async function toggleAtivo() {
    setPending(true);
    const res = await fetch(`/api/configuracoes/tracking/sources/${encodeURIComponent(source.source)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ativo: !source.ativo }),
    });
    setPending(false);
    if (!res.ok) {
      toast.error("Falha ao atualizar source");
      return;
    }
    toast.success(`${source.displayName} ${source.ativo ? "desativado" : "ativado"}`);
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={
        "flex items-center justify-between gap-3 rounded-md border border-foreground/8 px-3 py-2 " +
        (source.ativo ? "" : "opacity-50")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {source.color && (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: `#${source.color}` }}
            />
          )}
          <p className="text-sm font-medium">{source.displayName}</p>
          {source.paid && (
            <Badge variant="outline" className="text-[10px]">
              Pago
            </Badge>
          )}
          {!source.ativo && (
            <Badge variant="outline" className="text-[10px]">
              Inativo
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {source.leadCount} lead{source.leadCount === 1 ? "" : "s"} · ordem{" "}
          {source.ordem}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleAtivo}
        disabled={pending}
        title={source.ativo ? "Desativar" : "Ativar"}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Power className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

// ============================================================================
// ALIASES TAB
// ============================================================================
function AliasesTab({ aliases, sources }: { aliases: Alias[]; sources: Source[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [newAlias, setNewAlias] = useState("");
  const [newSource, setNewSource] = useState("");
  const [pending, setPending] = useState(false);

  async function addAlias() {
    if (!newAlias.trim() || !newSource) {
      toast.error("Informe alias e source");
      return;
    }
    setPending(true);
    const res = await fetch("/api/configuracoes/tracking/aliases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        alias: newAlias.trim().toLowerCase(),
        source: newSource,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Falha ao criar alias", { description: json.error });
      return;
    }
    toast.success("Alias criado");
    setNewAlias("");
    setNewSource("");
    startTransition(() => router.refresh());
  }

  // Agrupa aliases por source pra leitura.
  const bySource = aliases.reduce<Record<string, string[]>>((acc, a) => {
    if (!acc[a.source]) acc[a.source] = [];
    acc[a.source]!.push(a.alias);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar alias</CardTitle>
          <CardDescription>
            Mapeia um valor de <code>utm_source</code> (em lowercase) para um
            source canônico. Ex: <code>tiktokshop</code> → <code>TikTok</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value.toLowerCase())}
              placeholder="alias (lowercase)"
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <Select value={newSource} onValueChange={(v) => setNewSource(v ?? "")}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="Source canônico…" />
              </SelectTrigger>
              <SelectContent>
                {sources
                  .filter((s) => s.ativo)
                  .map((s) => (
                    <SelectItem key={s.source} value={s.source}>
                      {s.displayName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button onClick={addAlias} disabled={pending} size="sm">
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {Object.entries(bySource)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([source, items]) => (
            <Card key={source}>
              <CardContent className="py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">{source}</p>
                  <div className="flex flex-wrap gap-1">
                    {items.map((alias) => (
                      <AliasChip key={alias} alias={alias} />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}

function AliasChip({ alias }: { alias: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    const res = await fetch(`/api/configuracoes/tracking/aliases/${encodeURIComponent(alias)}`, {
      method: "DELETE",
    });
    setPending(false);
    if (!res.ok) {
      toast.error("Falha ao remover alias");
      return;
    }
    toast.success(`Alias "${alias}" removido`);
    startTransition(() => router.refresh());
  }

  return (
    <button
      onClick={remove}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
      title="Clique pra remover"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <RotateCcw className="size-3 opacity-0 hover:opacity-100" />
      )}
      {alias}
    </button>
  );
}
