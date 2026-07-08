"use client";

import { useState } from "react";
import { Handshake, MessageCircle } from "lucide-react";

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
  // Endereço do imóvel (garantia)
  imovelCep: string | null;
  imovelLogradouro: string | null;
  imovelNumero: string | null;
  imovelComplemento: string | null;
  imovelBairro: string | null;
  // Cônjuge / coobrigado
  conjugeNome: string | null;
  conjugeCpf: string | null;
  conjugeEmail: string | null;
  conjugeNascimento: string | null;
  conjugeWhatsapp: string | null;
  conjugeCompoeRenda: boolean | null;
  conjugeRendaCentavos: number | null;
  conjugeOcupacao: string | null;
  // Qualificação por WhatsApp (Heloísa / IA)
  qualifObjetivo: string | null;
  qualifTitularidade: string | null;
  qualifImovelRegularizado: string | null;
  qualifPendenciaJuridica: string | null;
  qualifUrgencia: string | null;
  qualifWhatsappStatus: string | null;
  qualifWhatsappEm: string | null;
  bancoAprovador: string | null;
  valorLiberadoCentavos: number | null;
  comissaoCentavos: number | null;
  dataFechamento: string | null;
  // Parceria (Portal de Parceiros)
  parceiroNome: string | null;
  parceiroPortalId: string | null;
  observacoesParceiro: string | null;
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

/** "01310100" / "01310-100" → "01310-100". Mantém original se não tiver 8 dígitos. */
function formatCep(cep: string | null | undefined): string | null {
  if (!cep) return null;
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return cep;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** "YYYY-MM-DD" → "DD/MM/YYYY". Mantém original se não casar. */
function formatDateBr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
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
// Endereço do imóvel (garantia)
// ============================================================================

export function LeadEnderecoImovelCard({ lead, canEdit }: { lead: LeadDetailData; canEdit: boolean }) {
  const [cep, setCep] = useState(lead.imovelCep ?? "");
  const [logradouro, setLogradouro] = useState(lead.imovelLogradouro ?? "");
  const [numero, setNumero] = useState(lead.imovelNumero ?? "");
  const [complemento, setComplemento] = useState(lead.imovelComplemento ?? "");
  const [bairro, setBairro] = useState(lead.imovelBairro ?? "");

  function reset() {
    setCep(lead.imovelCep ?? "");
    setLogradouro(lead.imovelLogradouro ?? "");
    setNumero(lead.imovelNumero ?? "");
    setComplemento(lead.imovelComplemento ?? "");
    setBairro(lead.imovelBairro ?? "");
  }

  const hasData = Boolean(
    lead.imovelCep ||
      lead.imovelLogradouro ||
      lead.imovelNumero ||
      lead.imovelComplemento ||
      lead.imovelBairro,
  );
  // Sem endereço e sem permissão de editar → não polui a ficha com um card de "—".
  if (!hasData && !canEdit) return null;

  return (
    <LeadEditableCard
      title="Endereço do imóvel"
      description="Imóvel dado em garantia"
      canEdit={canEdit}
      leadId={lead.id}
      view={[
        { label: "CEP", value: formatCep(lead.imovelCep) },
        { label: "Logradouro", value: lead.imovelLogradouro },
        { label: "Número", value: lead.imovelNumero },
        { label: "Complemento", value: lead.imovelComplemento },
        { label: "Bairro", value: lead.imovelBairro },
      ]}
      edit={
        <FormGrid>
          <FormField label="CEP" htmlFor="ed-imovel-cep">
            <Input id="ed-imovel-cep" value={cep} onChange={(e) => setCep(e.currentTarget.value)} placeholder="00000-000" inputMode="numeric" />
          </FormField>
          <FormField label="Número" htmlFor="ed-imovel-numero">
            <Input id="ed-imovel-numero" value={numero} onChange={(e) => setNumero(e.currentTarget.value)} />
          </FormField>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ed-imovel-logradouro">Logradouro</Label>
            <Input id="ed-imovel-logradouro" value={logradouro} onChange={(e) => setLogradouro(e.currentTarget.value)} placeholder="Rua, avenida..." />
          </div>
          <FormField label="Complemento" htmlFor="ed-imovel-complemento">
            <Input id="ed-imovel-complemento" value={complemento} onChange={(e) => setComplemento(e.currentTarget.value)} placeholder="Apto, bloco..." />
          </FormField>
          <FormField label="Bairro" htmlFor="ed-imovel-bairro">
            <Input id="ed-imovel-bairro" value={bairro} onChange={(e) => setBairro(e.currentTarget.value)} />
          </FormField>
        </FormGrid>
      }
      buildPayload={() => ({
        imovelCep: cep.replace(/\D/g, "") || null,
        imovelLogradouro: logradouro.trim() || null,
        imovelNumero: numero.trim() || null,
        imovelComplemento: complemento.trim() || null,
        imovelBairro: bairro.trim() || null,
      })}
      onSavedReset={reset}
    />
  );
}

// ============================================================================
// Cônjuge / coobrigado
// ============================================================================

const ESTADOS_CIVIS_COM_CONJUGE = new Set(["Casado(a)", "União Estável"]);

export function LeadConjugeCard({ lead, canEdit }: { lead: LeadDetailData; canEdit: boolean }) {
  const [nome, setNome] = useState(lead.conjugeNome ?? "");
  const [cpf, setCpf] = useState(lead.conjugeCpf ?? "");
  const [nascimento, setNascimento] = useState(lead.conjugeNascimento ?? "");
  const [email, setEmail] = useState(lead.conjugeEmail ?? "");
  const [whatsapp, setWhatsapp] = useState(lead.conjugeWhatsapp ?? "");

  function reset() {
    setNome(lead.conjugeNome ?? "");
    setCpf(lead.conjugeCpf ?? "");
    setNascimento(lead.conjugeNascimento ?? "");
    setEmail(lead.conjugeEmail ?? "");
    setWhatsapp(lead.conjugeWhatsapp ?? "");
  }

  const hasData = Boolean(
    lead.conjugeNome ||
      lead.conjugeCpf ||
      lead.conjugeEmail ||
      lead.conjugeNascimento ||
      lead.conjugeWhatsapp,
  );
  const relevante =
    lead.estadoCivil != null && ESTADOS_CIVIS_COM_CONJUGE.has(lead.estadoCivil);
  // Faz sentido quando o lead é casado/união estável (meação) ou quando já há
  // dados do cônjuge. Para solteiros sem dados, o card não aparece.
  if (!relevante && !hasData) return null;

  return (
    <LeadEditableCard
      title="Cônjuge / coobrigado"
      description="Participa da garantia (meação)"
      canEdit={canEdit}
      leadId={lead.id}
      view={[
        { label: "Nome", value: lead.conjugeNome },
        { label: "CPF", value: lead.conjugeCpf ? formatCpf(lead.conjugeCpf) : null },
        { label: "Nascimento", value: formatDateBr(lead.conjugeNascimento) },
        { label: "Email", value: lead.conjugeEmail },
        { label: "WhatsApp", value: lead.conjugeWhatsapp ? formatPhoneBr(lead.conjugeWhatsapp) : null },
        { label: "Compõe renda?", value: lead.conjugeCompoeRenda == null ? null : lead.conjugeCompoeRenda ? "Sim" : "Não" },
        { label: "Renda do cônjuge", value: lead.conjugeRendaCentavos != null ? formatBrlFromCents(lead.conjugeRendaCentavos) : null },
        { label: "Ocupação do cônjuge", value: lead.conjugeOcupacao },
      ]}
      edit={
        <FormGrid>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ed-conj-nome">Nome completo</Label>
            <Input id="ed-conj-nome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
          </div>
          <FormField label="CPF" htmlFor="ed-conj-cpf">
            <Input id="ed-conj-cpf" value={cpf} onChange={(e) => setCpf(e.currentTarget.value)} placeholder="000.000.000-00" />
          </FormField>
          <FormField label="Data de nascimento" htmlFor="ed-conj-nasc">
            <Input id="ed-conj-nasc" type="date" value={nascimento} onChange={(e) => setNascimento(e.currentTarget.value)} />
          </FormField>
          <FormField label="Email" htmlFor="ed-conj-email">
            <Input id="ed-conj-email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          </FormField>
          <FormField label="WhatsApp" htmlFor="ed-conj-wa">
            <Input id="ed-conj-wa" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.currentTarget.value)} placeholder="+5547999999999" />
          </FormField>
        </FormGrid>
      }
      buildPayload={() => ({
        conjugeNome: nome.trim() || null,
        conjugeCpf: cpf.trim() || null,
        conjugeNascimento: nascimento.trim() || null,
        conjugeEmail: email.trim() || null,
        conjugeWhatsapp: whatsapp.trim() || null,
      })}
      onSavedReset={reset}
    />
  );
}

// ============================================================================
// Origem (read-only)
// ============================================================================

/**
 * Card "Parceria" — exibido apenas quando o lead veio do Portal de Parceiros.
 * Somente leitura: a fonte da verdade é o portal (parceiros.credios.com.br).
 */
export function LeadParceriaCard({ lead }: { lead: LeadDetailData }) {
  if (!lead.parceiroNome && !lead.parceiroPortalId && !lead.observacoesParceiro) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake className="size-4 text-muted-foreground" aria-hidden />
          Parceria
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2.5 text-sm sm:grid sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-1.5 sm:space-y-0">
          <div className="flex flex-col gap-0.5 sm:contents">
            <dt className="text-xs text-muted-foreground sm:text-sm">
              Indicado por
            </dt>
            <dd className="min-w-0 font-medium">{lead.parceiroNome ?? "—"}</dd>
          </div>
          {lead.parceiroPortalId && (
            <div className="flex flex-col gap-0.5 sm:contents">
              <dt className="text-xs text-muted-foreground sm:text-sm">
                Parceiro no portal
              </dt>
              <dd className="min-w-0">
                <a
                  href={`https://parceiros.credios.com.br/admin/parceiros/${lead.parceiroPortalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Abrir cadastro do parceiro
                </a>
              </dd>
            </div>
          )}
          {lead.observacoesParceiro && (
            <div className="flex flex-col gap-0.5 sm:contents">
              <dt className="text-xs text-muted-foreground sm:text-sm">
                Observações do parceiro
              </dt>
              <dd className="min-w-0 whitespace-pre-wrap">
                {lead.observacoesParceiro}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

const QUALIF_REGULARIZADO: Record<string, string> = {
  sim: "Sim",
  nao: "Não",
  nao_sei: "Não sei",
};
const QUALIF_URGENCIA: Record<string, string> = {
  ate_30_dias: "Até 30 dias",
  "1_3_meses": "1 a 3 meses",
  sem_pressa: "Sem pressa",
};

/** Qualificação levantada pela Heloísa (IA) no WhatsApp — somente leitura. */
export function LeadQualificacaoCard({ lead }: { lead: LeadDetailData }) {
  const temAlgo =
    lead.qualifWhatsappStatus ||
    lead.qualifObjetivo ||
    lead.qualifTitularidade ||
    lead.qualifImovelRegularizado ||
    lead.qualifPendenciaJuridica ||
    lead.qualifUrgencia;
  if (!temAlgo) return null;

  const concluida = lead.qualifWhatsappStatus === "concluida";
  const linhas: { label: string; value: string | null }[] = [
    { label: "Objetivo do crédito", value: lead.qualifObjetivo },
    { label: "Titularidade do imóvel", value: lead.qualifTitularidade },
    {
      label: "Documentação regular",
      value: lead.qualifImovelRegularizado
        ? (QUALIF_REGULARIZADO[lead.qualifImovelRegularizado] ?? lead.qualifImovelRegularizado)
        : null,
    },
    { label: "Pendência jurídica", value: lead.qualifPendenciaJuridica },
    {
      label: "Urgência",
      value: lead.qualifUrgencia
        ? (QUALIF_URGENCIA[lead.qualifUrgencia] ?? lead.qualifUrgencia)
        : null,
    },
  ].filter((l) => l.value);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
          Qualificação por WhatsApp
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
              concluida
                ? "bg-credios-blue/10 text-credios-blue"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {concluida ? "Concluída" : "Em andamento"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            A Heloísa iniciou a conversa, mas ainda não levantou os dados.
          </p>
        ) : (
          <dl className="space-y-2.5 text-sm sm:grid sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-1.5 sm:space-y-0">
            {linhas.map((l) => (
              <div key={l.label} className="flex flex-col gap-0.5 sm:contents">
                <dt className="text-xs text-muted-foreground sm:text-sm">{l.label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap font-medium">{l.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

export function LeadOrigemCard({
  lead,
  detalhado = true,
}: {
  lead: LeadDetailData;
  /** false = versão ENXUTA pro consultor (só canal/fonte/tipo). O tracking
   *  completo (UTMs, GCLID, referrer, página) é ferramenta de admin/marketing
   *  — pro consultor é só ruído na ficha. */
  detalhado?: boolean;
}) {
  // Source canônico (migration 0017) + fallback pro legado `origem`.
  const sourceLabel = lead.source ?? lead.origem;
  const channelLabel = lead.channel;

  const basicos = [
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
  ];

  if (!detalhado) {
    const visiveis = basicos.filter((i) => i.value);
    if (visiveis.length === 0) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Origem</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {visiveis.map((i, idx) => (
              <span key={i.label}>
                {idx > 0 && <span className="text-foreground/20"> · </span>}
                <span className="text-muted-foreground">{i.label}: </span>
                <span className="font-medium">{i.value}</span>
              </span>
            ))}
          </p>
        </CardContent>
      </Card>
    );
  }

  const items = [
    ...basicos,
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
