"use client";

import { Fragment, useState } from "react";

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
  situacaoImovel: string | null;
  tipoPessoa: string | null;
  valorImovelCentavos: number | null;
  valorCreditoCentavos: number | null;
  bancoAprovador: string | null;
  valorLiberadoCentavos: number | null;
  comissaoCentavos: number | null;
  dataFechamento: string | null;
  origem: string | null;
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
  const [situacao, setSituacao] = useState(lead.situacaoImovel ?? "");
  const [tipoPessoa, setTipoPessoa] = useState(lead.tipoPessoa ?? "");
  const [valorImovel, setValorImovel] = useState(centsToReaisStr(lead.valorImovelCentavos));
  const [valorCredito, setValorCredito] = useState(centsToReaisStr(lead.valorCreditoCentavos));

  function reset() {
    setObjetivo(lead.objetivoCredito ?? "");
    setTipoImovel(lead.tipoImovel ?? "");
    setSituacao(lead.situacaoImovel ?? "");
    setTipoPessoa(lead.tipoPessoa ?? "");
    setValorImovel(centsToReaisStr(lead.valorImovelCentavos));
    setValorCredito(centsToReaisStr(lead.valorCreditoCentavos));
  }

  const view = [
    { label: "Produto", value: lead.produto },
    { label: "Objetivo", value: lead.objetivoCredito },
    { label: "Tipo de imóvel", value: lead.tipoImovel },
    { label: "Situação do imóvel", value: lead.situacaoImovel },
    { label: "Tipo de pessoa", value: lead.tipoPessoa },
    { label: "Valor do imóvel", value: lead.valorImovelCentavos != null ? formatBrlFromCents(lead.valorImovelCentavos) : null },
    { label: "Valor buscado", value: lead.valorCreditoCentavos != null ? formatBrlFromCents(lead.valorCreditoCentavos) : null },
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
          <FormField label="Valor buscado (R$)" htmlFor="ed-vcred">
            <Input id="ed-vcred" type="number" step="0.01" min="0" value={valorCredito} onChange={(e) => setValorCredito(e.currentTarget.value)} />
          </FormField>
        </FormGrid>
      }
      buildPayload={() => ({
        objetivoCredito: objetivo || null,
        tipoImovel: tipoImovel || null,
        situacaoImovel: situacao || null,
        tipoPessoa: tipoPessoa || null,
        valorImovelCentavos: reaisToCents(valorImovel),
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
  const items = [
    { label: "Origem", value: lead.origem },
    { label: "Dispositivo", value: lead.dispositivo },
    { label: "Rede", value: lead.rede },
    { label: "Campanha", value: lead.utmCampaign },
    { label: "Grupo de anúncios", value: lead.grupoAnuncios },
    { label: "Criativo", value: lead.criativo },
    { label: "Palavra-chave", value: lead.palavraChave },
    { label: "Tipo correspondência", value: lead.tipoCorrespondencia },
    { label: "GCLID", value: lead.gclid ? <code className="text-xs">{lead.gclid}</code> : null },
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
          <dl className="grid grid-cols-[max-content_1fr] gap-y-1.5 gap-x-4 text-sm">
            {visible.map((i) => (
              <Fragment key={i.label}>
                <dt className="text-muted-foreground">{i.label}</dt>
                <dd className="break-all">{i.value}</dd>
              </Fragment>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
