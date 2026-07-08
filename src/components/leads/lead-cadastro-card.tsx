import { AlertTriangle, IdCard } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CadastroPf } from "@/lib/score/cadastro-pf";

// Apresentação do Cadastro PF Plus (Direct Data). A resposta traz MUITA
// coisa — a hierarquia aqui é deliberada:
//   1. red flags primeiro (óbito, CPF irregular, nome divergente, renda
//      estimada muito abaixo da declarada);
//   2. fatos de identidade/renda num grid enxuto;
//   3. listas longas (telefones/e-mails/endereços/domicílio) recolhidas em
//      <details> nativo — server component, sem JS.

type Props = {
  cadastro: CadastroPf;
  /** Rótulo já formatado ("hoje" / "há 3d") — calculado no server block. */
  consultadoLabel: string;
  /** Dados declarados no form, pra confronto. */
  declarado: { nome: string; rendaMensalCentavos: number | null };
};

const brl = (v: number | null | undefined, frac = 0) =>
  v != null
    ? v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: frac,
      })
    : "—";

function normalizaNome(n: string | null | undefined): string {
  return (n ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dataBr(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.split(" ")[0] ?? null;
}

export function LeadCadastroCard({ cadastro, consultadoLabel, declarado }: Props) {
  const c = cadastro;

  // ── red flags ──
  const flags: Array<{ texto: string; grave: boolean }> = [];
  if (c.obito) flags.push({ texto: "ÓBITO registrado para este CPF", grave: true });
  if (c.situacaoCadastral && c.situacaoCadastral.toLowerCase() !== "regular") {
    flags.push({ texto: `CPF ${c.situacaoCadastral} na Receita Federal`, grave: true });
  }
  const nomeOficial = normalizaNome(c.nome);
  const nomeForm = normalizaNome(declarado.nome);
  if (nomeOficial && nomeForm && nomeOficial !== nomeForm && !nomeOficial.startsWith(nomeForm) && !nomeForm.startsWith(nomeOficial)) {
    flags.push({ texto: `Nome oficial difere do informado: "${c.nome}"`, grave: false });
  }
  const rendaDeclarada = declarado.rendaMensalCentavos != null ? declarado.rendaMensalCentavos / 100 : null;
  if (c.rendaEstimada != null && rendaDeclarada != null && rendaDeclarada > 0 && c.rendaEstimada < rendaDeclarada * 0.5) {
    flags.push({
      texto: `Renda estimada (${brl(c.rendaEstimada)}) bem abaixo da declarada (${brl(rendaDeclarada)})`,
      grave: false,
    });
  }

  const linhas: Array<[string, string | null]> = [
    ["Nome oficial", c.nome ?? null],
    [
      "Nascimento",
      c.dataNascimento ? `${dataBr(c.dataNascimento)}${c.idade != null ? ` · ${c.idade} anos` : ""}` : null,
    ],
    ["Situação do CPF", c.situacaoCadastral ? `${c.situacaoCadastral}${dataBr(c.dataSituacaoCadastral) ? ` (desde ${dataBr(c.dataSituacaoCadastral)})` : ""}` : null],
    ["Nome da mãe", c.nomeMae ?? null],
    ["Profissão (CBO)", c.cbo ?? null],
    ["Classe social", c.classeSocial ?? null],
    [
      "Renda estimada",
      c.rendaEstimada != null
        ? `${brl(c.rendaEstimada)}${rendaDeclarada != null ? ` · declarada: ${brl(rendaDeclarada)}` : ""}`
        : null,
    ],
  ];

  const dom = c.perfilDomiciliar;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IdCard className="size-4 text-muted-foreground" aria-hidden />
          Cadastro &amp; Receita Federal
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
              c.situacaoCadastral?.toLowerCase() === "regular" && !c.obito
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-red-500/10 text-red-700 dark:text-red-300"
            }`}
          >
            {c.obito ? "Óbito" : (c.situacaoCadastral ?? "—")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {flags.length > 0 && (
          <ul className="space-y-1">
            {flags.map((f) => (
              <li
                key={f.texto}
                className={`flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  f.grave
                    ? "bg-red-500/10 text-red-700 dark:text-red-300"
                    : "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                }`}
              >
                <AlertTriangle className="size-3.5 mt-[1px] shrink-0" />
                {f.texto}
              </li>
            ))}
          </ul>
        )}

        <dl className="space-y-2.5 text-sm sm:grid sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-1.5 sm:space-y-0">
          {linhas
            .filter(([, v]) => v)
            .map(([label, valor]) => (
              <div key={label} className="flex flex-col gap-0.5 sm:contents">
                <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
                <dd className="min-w-0 font-medium">{valor}</dd>
              </div>
            ))}
        </dl>

        {!!c.telefones?.length && (
          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Telefones conhecidos ({c.telefones.length})
            </summary>
            <ul className="mt-1.5 space-y-1 text-sm">
              {c.telefones.map((t, i) => (
                <li key={i} className="font-mono tabular-nums">
                  {t.telefoneComDDD}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {[t.tipoTelefone?.toLowerCase(), t.operadora, t.whatsApp ? "WhatsApp ✓" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {!!c.emails?.length && (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              E-mails conhecidos ({c.emails.length})
            </summary>
            <ul className="mt-1.5 space-y-1 text-sm">
              {c.emails.map((e, i) => (
                <li key={i} className="truncate">{e.enderecoEmail}</li>
              ))}
            </ul>
          </details>
        )}

        {!!c.enderecos?.length && (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Endereços conhecidos ({c.enderecos.length})
            </summary>
            <ul className="mt-1.5 space-y-1.5 text-sm">
              {c.enderecos.map((e, i) => (
                <li key={i}>
                  {[e.logradouro, e.numero, e.complemento].filter(Boolean).join(", ")}
                  <span className="block text-xs text-muted-foreground">
                    {[e.bairro, e.cidade, e.uf, e.cep].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {dom && (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Perfil domiciliar
            </summary>
            <dl className="mt-1.5 space-y-1 text-sm">
              {(
                [
                  ["Domicílio", dom.tipoDomicilio],
                  ["Moradores", dom.quantidadeMoradores != null ? String(dom.quantidadeMoradores) : null],
                  ["Renda domiciliar", dom.rendaDomiciliar ? brl(Number(dom.rendaDomiciliar)) : null],
                  ["Renda per capita", dom.rendaPerCapita ? `${brl(Number(dom.rendaPerCapita))}${dom.faixaRendaPerCapita ? ` — ${dom.faixaRendaPerCapita}` : ""}` : null],
                  ["Confiabilidade", dom.confiabilidade],
                ] as Array<[string, string | null | undefined]>
              )
                .filter(([, v]) => v)
                .map(([l, v]) => (
                  <div key={l}>
                    <span className="text-xs text-muted-foreground">{l}: </span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
            </dl>
          </details>
        )}

        <p className="text-[11px] text-fg-subtle">
          Fonte: Direct Data (Cadastro PF Plus) · consultado {consultadoLabel}.
          Dados de bureaus — podem estar desatualizados; use como sinal, não
          como prova.
        </p>
      </CardContent>
    </Card>
  );
}
