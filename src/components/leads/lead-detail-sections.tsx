"use client";

import { useState } from "react";

import { LeadEditableCard } from "./lead-editable-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADOS_CIVIS,
  OBJETIVOS_CREDITO,
  OCUPACOES,
  SITUACOES_IMOVEL,
  TIPOS_IMOVEL,
  TIPOS_PESSOA,
  UFS,
} from "@/lib/constants";
import { formatBrlFromCents } from "@/lib/formatters/currency";
import {
  creditoTotalBuscadoCentavos,
  temSaldoDevedor,
} from "@/lib/leads/credito-total";
import { formatCpf, formatPhoneBr } from "@/lib/formatters/phone";

export type LeadDetailData = {
  id: string;
  nome: string;
  cpf: string | null;
  estadoCivil: string | null;
  ocupacao: string | null;
  rendaMensalCentavos: number | null;
  whatsapp: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  produto: string;
  objetivoCredito: string | null;
  tipoImovel: string | null;
  tipoImovelDetalhes: string | null;
  situacaoImovel: string | null;
  tipoPessoa: string | null;
  valorImovelCentavos: number | null;
  saldoDevedorCentavos: number | null;
  valorCreditoCentavos: number | null;
  bancoAprovador: string | null;
  valorLiberadoCentavos: number | null;
  comissaoCentavos: number | null;
  dataFechamento: string | null;
  // Taxonomia hierárquica (migration 0017)
  channel: string | null;
  source: string | null;
  paid: boolean | null;
  origem: string | null;        // legado, mirror de source
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  rede: string | null;
  dispositivo: string | null;
  palavraChave: string | null;
  grupoAnuncios: string | null;
  criativo: string | null;
  tipoCorrespondencia: string | null;
  referrer: string | null;
  paginaEntrada: string | null;
};

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function FormField({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function reaisToCents(s: string): number | null {
  if (!s || s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centsToReaisStr(cents: number | null | undefined): string {
  if (cents == null) return "";
  return String(cents / 100);
}

// ============================================================================
// Pessoais
// ============================================================================

export function LeadPessoaisCard({ lead, canEdit }: { lead: LeadDetailData; canEdit: boolean }) {
  const [nome, setNome] = useState(lead.nome);
  const [cpf, setCpf] = useState(lead.cpf ?? "");
  const [estadoCivil, setEstadoCivil] = useState(lead.estadoCivil ?? "");
  const [ocupacao, setOcupacao] = useState(lead.ocupacao ?? "");
  const [renda, setRenda] = useState(centsToReaisStr(lead.rendaMensalCentavos));

  function reset() {
    setNome(lead.nome);
    setCpf(lead.cpf ?? "");
    setEstadoCivil(lead.estadoCivil ?? "");
    setOcupacao(lead.ocupacao ?? "");
    setRenda(centsToReaisStr(lead.rendaMensalCentavos));
  }

  return (
    <LeadEditableCard
      title="Informações pessoais"
      canEdit={canEdit}
      leadId={lead.id}
      view={[
        { label: "Nome", value: lead.nome },
        { label: "CPF", value: lead.cpf ? formatCpf(lead.cpf) : null },
        { label: "Estado civil", value: lead.estadoCivil },
        { label: "Ocupação", value: lead.ocupacao },
        {
          label: "Renda mensal",
          value: lead.rendaMensalCentavos != null ? formatBrlFromCents(lead.rendaMensalCentavos) : null,
        },
      ]}
      edit={
        <FormGrid>
          <FormField label="Nome" htmlFor="ed-nome">
            <Input id="ed-nome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
          </FormField>
          <FormField label="CPF" htmlFor="ed-cpf">
            <Input id="ed-cpf" value={cpf} onChange={(e) => setCpf(e.currentTarget.value)} placeholder="000.000.000-00" />
          </FormField>
          <FormField label="Estado civil">
            <Select value={estadoCivil} onValueChange={(v) => setEstadoCivil(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {ESTADOS_CIVIS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Ocupação">
            <Select value={ocupacao} onValueChange={(v) => setOcupacao(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {OCUPACOES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Renda mensal (R$)" htmlFor="ed-renda">
            <Input id="ed-renda" type="number" step="0.01" min="0" value={renda} onChange={(e) => setRenda(e.currentTarget.value)} />
          </FormField>
        </FormGrid>
      }
      validate={() => (nome.trim().length < 2 ? "Nome muito curto" : null)}
      buildPayload={() => ({
        nome: nome.trim(),
        cpf: cpf.trim() || null,
        estadoCivil: estadoCivil || null,
        ocupacao: ocupacao || null,
        rendaMensalCentavos: reaisToCents(renda),
      })}
      onSavedReset={reset}
    />
  );
}

// ============================================================================
// Contato
// ============================================================================

export function LeadContatoCard({ lead, canEdit }: { lead: LeadDetailData; canEdit: boolean }) {
  const [whatsapp, setWhatsapp] = useState(lead.whatsapp ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [cidade, setCidade] = useState(lead.cidade ?? "");
  const [estado, setEstado] = useState(lead.estado ?? "");

  function reset() {
    setWhatsapp(lead.whatsapp ?? "");
    setEmail(lead.email ?? "");
    setCidade(lead.cidade ?? "");
    setEstado(lead.estado ?? "");
  }

  return (
    <LeadEditableCard
      title="Contato"
      canEdit={canEdit}
      leadId={lead.id}
      view={[
        { label: "WhatsApp", value: formatPhoneBr(lead.whatsapp) },
        { label: "Email", value: lead.email },
        { label: "Cidade", value: lead.cidade },
        { label: "UF", value: lead.estado },
      ]}
      edit={
        <FormGrid>
          <FormField label="WhatsApp" htmlFor="ed-wa">
            <Input id="ed-wa" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.currentTarget.value)} placeholder="+5547999999999" />
          </FormField>
          <FormField label="Email" htmlFor="ed-email">
            <Input id="ed-email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          </FormField>
          <FormField label="Cidade" htmlFor="ed-cidade">
            <Input id="ed-cidade" value={cidade} onChange={(e) => setCidade(e.currentTarget.value)} />
          </FormField>
          <FormField label="UF">
            <Select value={estado} onValueChange={(v) => setEstado(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </FormGrid>
      }
      validate={() => (whatsapp.trim().length < 8 ? "WhatsApp obrigatório" : null)}
      buildPayload={() => ({
        whatsapp: whatsapp.trim(),
        email: email.trim() || null,
        cidade: cidade.trim() || null,
        estado: estado || null,
      })}
      onSavedReset={reset}
    />
  );
}

// ============================================================================
// Operação (CGI)
// ============================================================================

export function LeadOperacaoCard({ lead, canEdit }: { lead: LeadDetailData; canEdit: boolean }) {
  const [objetivo, setObjetivo] = useState(lead.objetivoCredito ?? "");
  const [tipoImovel, setTipoImovel] = useState(lead.tipoImovel ?? "");
  const [tipoImovelDetalhes, setTipoImovelDetalhes] = useState(lead.tipoImovelDetalhes ?? "");
  const [situacao, setSituacao] = useState(lead.situacaoImovel ?? "");
  const [tipoPessoa, setTipoPessoa] = useState(lead.tipoPessoa ?? "");
  const [valorImovel, setValorImovel] = useState(centsToReaisStr(lead.valorImovelCentavos));
  const [saldoDevedor, setSaldoDevedor] = useState(centsToReaisStr(lead.saldoDevedorCentavos));
  const [valorCredito, setValorCredito] = useState(centsToReaisStr(lead.valorCreditoCentavos));

  function reset() {
    setObjetivo(lead.objetivoCredito ?? "");
    setTipoImovel(lead.tipoImovel ?? "");
    setTipoImovelDetalhes(lead.tipoImovelDetalhes ?? "");
    setSituacao(lead.situacaoImovel ?? "");
    setTipoPessoa(lead.tipoPessoa ?? "");
    setValorImovel(centsToReaisStr(lead.valorImovelCentavos));
    setSaldoDevedor(centsToReaisStr(lead.saldoDevedorCentavos));
    setValorCredito(centsToReaisStr(lead.valorCreditoCentavos));
  }

  // Esclarecimento sobre o tipo de imóvel — só faz sentido pra Terreno/Outro
  // (é onde o consultor precisa de mais contexto pra triagem). Para os demais
  // tipos (Casa, Apartamento, Sala Comercial), o campo é ocultado.
  const showImovelDetalhes = tipoImovel === "Terreno" || tipoImovel === "Outro";

  const view = [
    { label: "Produto", value: lead.produto },
    { label: "Objetivo", value: lead.objetivoCredito },
    { label: "Tipo de imóvel", value: lead.tipoImovel },
    // View: linha aparece só quando há esclarecimento (não polui o card pra
    // leads de Casa/Apartamento, que não precisam dele).
    { label: "Esclarecimento sobre o imóvel", value: lead.tipoImovelDetalhes },
    { label: "Situação do imóvel", value: lead.situacaoImovel },
    { label: "Tipo de pessoa", value: lead.tipoPessoa },
    { label: "Valor do imóvel", value: lead.valorImovelCentavos != null ? formatBrlFromCents(lead.valorImovelCentavos) : null },
    // Saldo devedor só aparece quando preenchido (imóvel financiado).
    // Para imóveis quitados ele fica null e a row é ocultada pelo viewer.
    { label: "Saldo devedor", value: lead.saldoDevedorCentavos != null ? formatBrlFromCents(lead.saldoDevedorCentavos) : null },
    { label: "Valor buscado", value: lead.valorCreditoCentavos != null ? formatBrlFromCents(lead.valorCreditoCentavos) : null },
    // Total real da operação quando o imóvel é financiado: o novo crédito
    // precisa cobrir o saldo devedor (quitação) + o valor que o cliente quer
    // receber em mãos. A maioria informa só o "valor de força" no simulador,
    // subdimensionando a operação. Só aparece quando há saldo devedor —
    // pra imóvel quitado seria redundante (total == valor buscado).
    {
      label: "Total de crédito buscado",
      value:
        temSaldoDevedor(lead.saldoDevedorCentavos) && lead.valorCreditoCentavos != null ? (
          <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-semibold">
              {formatBrlFromCents(
                creditoTotalBuscadoCentavos(
                  lead.valorCreditoCentavos,
                  lead.saldoDevedorCentavos,
                ),
              )}
            </span>
            <span className="text-[11px] text-muted-foreground">
              valor buscado + saldo devedor
            </span>
          </span>
        ) : null,
    },
  ];

  if (lead.bancoAprovador) {
    view.push(
      { label: "Banco aprovador", value: lead.bancoAprovador },
      { label: "Valor liberado", value: lead.valorLiberadoCentavos != null ? formatBrlFromCents(lead.valorLiberadoCentavos) : null },
      { label: "Comissão", value: lead.comissaoCentavos != null ? formatBrlFromCents(lead.comissaoCentavos) : null },
      { label: "Data fechamento", value: lead.dataFechamento },
    );
  }

  return (
    <LeadEditableCard
      title="Imóvel e crédito"
      canEdit={canEdit}
      leadId={lead.id}
      view={view}
      edit={
        <FormGrid>
          <FormField label="Objetivo do crédito">
            <Select value={objetivo} onValueChange={(v) => setObjetivo(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {OBJETIVOS_CREDITO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Tipo de imóvel">
            <Select value={tipoImovel} onValueChange={(v) => setTipoImovel(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {TIPOS_IMOVEL.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {showImovelDetalhes && (
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="ed-imovel-detalhes">Esclarecimento sobre o imóvel</Label>
              <textarea
                id="ed-imovel-detalhes"
                value={tipoImovelDetalhes}
                onChange={(e) => setTipoImovelDetalhes(e.currentTarget.value)}
                rows={3}
                maxLength={2000}
                placeholder={tipoImovel === "Terreno"
                  ? "Localização, tamanho, se é em condomínio, benfeitorias..."
                  : "Tipo do imóvel (galpão, fazenda etc.), localização e principais características..."}
                className="w-full rounded-md border border-border-soft bg-card px-3 py-2 text-sm text-foreground placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <p className="text-[11px] text-fg-subtle leading-relaxed">
                Preenchido pelo cliente quando seleciona Terreno ou Outro no simulador.
              </p>
            </div>
          )}
          <FormField label="Situação do imóvel">
            <Select value={situacao} onValueChange={(v) => setSituacao(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {SITUACOES_IMOVEL.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Tipo de pessoa">
            <Select value={tipoPessoa} onValueChange={(v) => setTipoPessoa(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {TIPOS_PESSOA.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Valor do imóvel (R$)" htmlFor="ed-vimovel">
            <Input id="ed-vimovel" type="number" step="0.01" min="0" value={valorImovel} onChange={(e) => setValorImovel(e.currentTarget.value)} />
          </FormField>
          {/* Saldo devedor: campo aparece sempre no edit, mas o consultor
              só preenche quando situação = "Financiado". Se o lead muda de
              "Financiado" pra "Quitado", o admin pode zerar o saldo aqui. */}
          <FormField label="Saldo devedor (R$)" htmlFor="ed-saldo">
            <Input
              id="ed-saldo"
              type="number"
              step="0.01"
              min="0"
              value={saldoDevedor}
              onChange={(e) => setSaldoDevedor(e.currentTarget.value)}
              placeholder={situacao === "Financiado" ? "Obrigatório quando financiado" : "Apenas se financiado"}
            />
          </FormField>
          <FormField label="Valor buscado (R$)" htmlFor="ed-vcred">
            <Input id="ed-vcred" type="number" step="0.01" min="0" value={valorCredito} onChange={(e) => setValorCredito(e.currentTarget.value)} />
          </FormField>
        </FormGrid>
      }
      buildPayload={() => ({
        objetivoCredito: objetivo || null,
        tipoImovel: tipoImovel || null,
        // Esclarecimento só faz sentido pra Terreno/Outro — se admin trocar
        // pra Casa/Apartamento, força null pra evitar dado órfão.
        tipoImovelDetalhes: showImovelDetalhes ? (tipoImovelDetalhes.trim() || null) : null,
        situacaoImovel: situacao || null,
        tipoPessoa: tipoPessoa || null,
        valorImovelCentavos: reaisToCents(valorImovel),
        // Quando situação ≠ "Financiado", força null no saldo devedor pra evitar
        // dado órfão (ex: lead muda de Financiado pra Quitado e saldo antigo
        // permaneceria por inércia).
        saldoDevedorCentavos: situacao === "Financiado" ? reaisToCents(saldoDevedor) : null,
        valorCreditoCentavos: reaisToCents(valorCredito),
      })}
      onSavedReset={reset}
    />
  );
}

// ============================================================================
// Origem (read-only)
// ============================================================================

export function LeadOrigemCard({ lead }: { lead: LeadDetailData }) {
  // Source canônico (migration 0017) + fallback pro legado `origem`.
  const sourceLabel = lead.source ?? lead.origem;
  const channelLabel = lead.channel;

  const items = [
    { label: "Canal", value: channelLabel },
    { label: "Fonte", value: sourceLabel },
    {
      label: "Tipo",
      value:
        lead.paid === null || lead.paid === undefined
          ? null
          : lead.paid
            ? "Pago"
            : "Orgânico",
    },
    { label: "Dispositivo", value: lead.dispositivo },
    { label: "Rede", value: lead.rede },
    { label: "Campanha", value: lead.utmCampaign },
    { label: "Grupo de anúncios", value: lead.grupoAnuncios },
    { label: "Criativo", value: lead.criativo },
    { label: "Palavra-chave", value: lead.palavraChave },
    { label: "Tipo correspondência", value: lead.tipoCorrespondencia },
    { label: "GCLID", value: lead.gclid ? <code className="block break-all text-xs">{lead.gclid}</code> : null },
    { label: "UTM Source", value: lead.utmSource },
    { label: "UTM Medium", value: lead.utmMedium },
    { label: "UTM Term", value: lead.utmTerm },
    { label: "UTM Content", value: lead.utmContent },
    { label: "Referrer", value: lead.referrer },
    { label: "Página de entrada", value: lead.paginaEntrada },
  ];
  const visible = items.filter((i) => i.value);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Origem (somente leitura)</CardTitle>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sem dados de tracking.</p>
        ) : (
          <dl className="space-y-2.5 text-sm sm:grid sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-1.5 sm:space-y-0">
            {visible.map((i) => (
              <div key={i.label} className="flex flex-col gap-0.5 sm:contents">
                <dt className="text-xs text-muted-foreground sm:text-sm">{i.label}</dt>
                <dd className="min-w-0 break-all">{i.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
