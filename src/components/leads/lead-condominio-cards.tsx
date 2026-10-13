"use client";

import { useState } from "react";

import { LeadEditableCard } from "./lead-editable-card";
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
  ASSEMBLEIA_STATUS,
  ASSEMBLEIA_STATUS_LABEL,
  FINALIDADES_CONDOMINIO,
  type AssembleiaStatus,
} from "@/lib/condominio/constants";
import { isValidCnpj, isValidCpf, maskCnpj, maskCpf } from "@/lib/formatters/cpf-cnpj";
import { formatBrlFromCents } from "@/lib/formatters/currency";

/** Dados do condomínio como a página de detalhe entrega (datas em ISO). */
export type CondominioDetailData = {
  cnpj: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  sindicoNome: string | null;
  sindicoCpf: string | null;
  sindicoProfissional: boolean | null;
  sindicoMandatoFim: string | null;
  administradora: string | null;
  numUnidades: number | null;
  arrecadacaoMensalCentavos: number | null;
  inadimplenciaBps: number | null;
  fundoReservaCentavos: number | null;
  finalidadeDetalhes: string | null;
  prazoDesejadoMeses: number | null;
  obraOrcada: boolean | null;
  assembleiaStatus: string | null;
  assembleiaData: string | null;
};

type LeadBase = {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  objetivoCredito: string | null;
  valorCreditoCentavos: number | null;
};

type Props = { lead: LeadBase; condominio: CondominioDetailData; canEdit: boolean };

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function FormField({
  label,
  children,
  htmlFor,
  full,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
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
  return cents == null ? "" : String(cents / 100);
}

function intOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function formatDateBr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function simNao(v: boolean | null): string | null {
  return v == null ? null : v ? "Sim" : "Não";
}

/** "true" | "false" | "" ↔ boolean | null, pra usar num Select. */
function TriSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger>
        <SelectValue placeholder="—">
          {(v: unknown) => (v === "true" ? "Sim" : v === "false" ? "Não" : null)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="true">Sim</SelectItem>
        <SelectItem value="false">Não</SelectItem>
      </SelectContent>
    </Select>
  );
}

const triToBool = (v: string) => (v === "" ? null : v === "true");
const boolToTri = (v: boolean | null) => (v == null ? "" : String(v));

// ============================================================================
// Condomínio
// ============================================================================

export function LeadCondominioCard({ lead, condominio: c, canEdit }: Props) {
  const [nome, setNome] = useState(lead.nome);
  const [cnpj, setCnpj] = useState(c.cnpj ? maskCnpj(c.cnpj) : "");
  const [cep, setCep] = useState(c.cep ?? "");
  const [logradouro, setLogradouro] = useState(c.logradouro ?? "");
  const [numero, setNumero] = useState(c.numero ?? "");
  const [complemento, setComplemento] = useState(c.complemento ?? "");
  const [bairro, setBairro] = useState(c.bairro ?? "");
  const [administradora, setAdministradora] = useState(c.administradora ?? "");
  const [unidades, setUnidades] = useState(c.numUnidades?.toString() ?? "");

  function reset() {
    setNome(lead.nome);
    setCnpj(c.cnpj ? maskCnpj(c.cnpj) : "");
    setCep(c.cep ?? "");
    setLogradouro(c.logradouro ?? "");
    setNumero(c.numero ?? "");
    setComplemento(c.complemento ?? "");
    setBairro(c.bairro ?? "");
    setAdministradora(c.administradora ?? "");
    setUnidades(c.numUnidades?.toString() ?? "");
  }

  const endereco = [
    [c.logradouro, c.numero].filter(Boolean).join(", "),
    c.complemento,
    c.bairro,
    [lead.cidade, lead.estado].filter(Boolean).join("/"),
    c.cep,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <LeadEditableCard
      title="Condomínio"
      canEdit={canEdit}
      leadId={lead.id}
      view={[
        { label: "Nome", value: lead.nome },
        { label: "CNPJ", value: c.cnpj ? maskCnpj(c.cnpj) : null },
        { label: "Endereço", value: endereco || null },
        { label: "Administradora", value: c.administradora },
        { label: "Unidades", value: c.numUnidades?.toString() ?? null },
      ]}
      edit={
        <FormGrid>
          <FormField label="Nome do condomínio" htmlFor="cd-nome" full>
            <Input id="cd-nome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
          </FormField>
          <FormField label="CNPJ" htmlFor="cd-cnpj">
            <Input
              id="cd-cnpj"
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(e) => setCnpj(maskCnpj(e.currentTarget.value))}
            />
          </FormField>
          <FormField label="Unidades" htmlFor="cd-unid">
            <Input id="cd-unid" type="number" min="0" step="1" value={unidades} onChange={(e) => setUnidades(e.currentTarget.value)} />
          </FormField>
          <FormField label="CEP" htmlFor="cd-cep">
            <Input id="cd-cep" inputMode="numeric" value={cep} onChange={(e) => setCep(e.currentTarget.value)} />
          </FormField>
          <FormField label="Bairro" htmlFor="cd-bairro">
            <Input id="cd-bairro" value={bairro} onChange={(e) => setBairro(e.currentTarget.value)} />
          </FormField>
          <FormField label="Logradouro" htmlFor="cd-log" full>
            <Input id="cd-log" value={logradouro} onChange={(e) => setLogradouro(e.currentTarget.value)} />
          </FormField>
          <FormField label="Número" htmlFor="cd-num">
            <Input id="cd-num" value={numero} onChange={(e) => setNumero(e.currentTarget.value)} />
          </FormField>
          <FormField label="Complemento" htmlFor="cd-comp">
            <Input id="cd-comp" value={complemento} onChange={(e) => setComplemento(e.currentTarget.value)} />
          </FormField>
          <FormField label="Administradora" htmlFor="cd-adm" full>
            <Input id="cd-adm" value={administradora} onChange={(e) => setAdministradora(e.currentTarget.value)} />
          </FormField>
        </FormGrid>
      }
      validate={() => {
        if (nome.trim().length < 2) return "Nome muito curto";
        if (cnpj.trim() && !isValidCnpj(cnpj)) return "CNPJ inválido";
        return null;
      }}
      buildPayload={() => ({
        nome: nome.trim(),
        condominio: {
          cnpj: cnpj.trim() || null,
          cep: cep.trim() || null,
          logradouro: logradouro.trim() || null,
          numero: numero.trim() || null,
          complemento: complemento.trim() || null,
          bairro: bairro.trim() || null,
          administradora: administradora.trim() || null,
          numUnidades: intOrNull(unidades),
        },
      })}
      onSavedReset={reset}
    />
  );
}

// ============================================================================
// Síndico
// ============================================================================

export function LeadSindicoCard({ lead, condominio: c, canEdit }: Props) {
  const [nome, setNome] = useState(c.sindicoNome ?? "");
  const [cpf, setCpf] = useState(c.sindicoCpf ? maskCpf(c.sindicoCpf) : "");
  const [profissional, setProfissional] = useState(boolToTri(c.sindicoProfissional));
  const [mandato, setMandato] = useState(c.sindicoMandatoFim ?? "");

  function reset() {
    setNome(c.sindicoNome ?? "");
    setCpf(c.sindicoCpf ? maskCpf(c.sindicoCpf) : "");
    setProfissional(boolToTri(c.sindicoProfissional));
    setMandato(c.sindicoMandatoFim ?? "");
  }

  return (
    <LeadEditableCard
      title="Síndico"
      description="WhatsApp e e-mail do síndico ficam no card Contato."
      canEdit={canEdit}
      leadId={lead.id}
      view={[
        { label: "Nome", value: c.sindicoNome },
        { label: "CPF", value: c.sindicoCpf ? maskCpf(c.sindicoCpf) : null },
        { label: "Síndico profissional", value: simNao(c.sindicoProfissional) },
        { label: "Fim do mandato", value: formatDateBr(c.sindicoMandatoFim) },
      ]}
      edit={
        <FormGrid>
          <FormField label="Nome do síndico" htmlFor="sd-nome" full>
            <Input id="sd-nome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} />
          </FormField>
          <FormField label="CPF" htmlFor="sd-cpf">
            <Input
              id="sd-cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.currentTarget.value))}
            />
          </FormField>
          <FormField label="Síndico profissional">
            <TriSelect value={profissional} onChange={setProfissional} />
          </FormField>
          <FormField label="Fim do mandato" htmlFor="sd-mandato">
            <Input id="sd-mandato" type="date" value={mandato} onChange={(e) => setMandato(e.currentTarget.value)} />
          </FormField>
        </FormGrid>
      }
      validate={() => (cpf.trim() && !isValidCpf(cpf) ? "CPF inválido" : null)}
      buildPayload={() => ({
        condominio: {
          sindicoNome: nome.trim() || null,
          sindicoCpf: cpf.trim() || null,
          sindicoProfissional: triToBool(profissional),
          sindicoMandatoFim: mandato || null,
        },
      })}
      onSavedReset={reset}
    />
  );
}

// ============================================================================
// Operação (condomínio)
// ============================================================================

export function LeadCondominioOperacaoCard({ lead, condominio: c, canEdit }: Props) {
  const [valor, setValor] = useState(centsToReaisStr(lead.valorCreditoCentavos));
  const [finalidade, setFinalidade] = useState(lead.objetivoCredito ?? "");
  const [detalhes, setDetalhes] = useState(c.finalidadeDetalhes ?? "");
  const [prazo, setPrazo] = useState(c.prazoDesejadoMeses?.toString() ?? "");
  const [obraOrcada, setObraOrcada] = useState(boolToTri(c.obraOrcada));

  function reset() {
    setValor(centsToReaisStr(lead.valorCreditoCentavos));
    setFinalidade(lead.objetivoCredito ?? "");
    setDetalhes(c.finalidadeDetalhes ?? "");
    setPrazo(c.prazoDesejadoMeses?.toString() ?? "");
    setObraOrcada(boolToTri(c.obraOrcada));
  }

  return (
    <LeadEditableCard
      title="Operação"
      canEdit={canEdit}
      leadId={lead.id}
      view={[
        { label: "Produto", value: "Crédito para condomínio" },
        {
          label: "Valor do crédito",
          value:
            lead.valorCreditoCentavos != null
              ? formatBrlFromCents(lead.valorCreditoCentavos)
              : null,
        },
        { label: "Finalidade", value: lead.objetivoCredito },
        { label: "Detalhes", value: c.finalidadeDetalhes },
        {
          label: "Prazo desejado",
          value: c.prazoDesejadoMeses != null ? `${c.prazoDesejadoMeses} meses` : null,
        },
        { label: "Obra já orçada", value: simNao(c.obraOrcada) },
      ]}
      edit={
        <FormGrid>
          <FormField label="Valor do crédito (R$)" htmlFor="op-valor">
            <Input id="op-valor" type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.currentTarget.value)} />
          </FormField>
          <FormField label="Prazo desejado (meses)" htmlFor="op-prazo">
            <Input id="op-prazo" type="number" step="1" min="1" value={prazo} onChange={(e) => setPrazo(e.currentTarget.value)} />
          </FormField>
          <FormField label="Finalidade">
            <Select value={finalidade} onValueChange={(v) => setFinalidade(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {FINALIDADES_CONDOMINIO.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Obra já orçada">
            <TriSelect value={obraOrcada} onChange={setObraOrcada} />
          </FormField>
          <FormField label="Detalhes da finalidade" htmlFor="op-det" full>
            <textarea
              id="op-det"
              rows={3}
              maxLength={2000}
              value={detalhes}
              onChange={(e) => setDetalhes(e.currentTarget.value)}
              className="w-full rounded-md border border-border-soft bg-card px-3 py-2 text-sm text-foreground placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </FormField>
        </FormGrid>
      }
      buildPayload={() => ({
        valorCreditoCentavos: reaisToCents(valor),
        objetivoCredito: finalidade || null,
        condominio: {
          finalidadeDetalhes: detalhes.trim() || null,
          prazoDesejadoMeses: intOrNull(prazo) || null,
          obraOrcada: triToBool(obraOrcada),
        },
      })}
      onSavedReset={reset}
    />
  );
}

// ============================================================================
// Saúde financeira e assembleia
// ============================================================================

export function LeadCondominioFinanceiroCard({ lead, condominio: c, canEdit }: Props) {
  const [arrecadacao, setArrecadacao] = useState(centsToReaisStr(c.arrecadacaoMensalCentavos));
  const [inadimplencia, setInadimplencia] = useState(
    c.inadimplenciaBps != null ? String(c.inadimplenciaBps / 100) : "",
  );
  const [fundo, setFundo] = useState(centsToReaisStr(c.fundoReservaCentavos));
  const [assStatus, setAssStatus] = useState(c.assembleiaStatus ?? "");
  const [assData, setAssData] = useState(c.assembleiaData ?? "");

  function reset() {
    setArrecadacao(centsToReaisStr(c.arrecadacaoMensalCentavos));
    setInadimplencia(c.inadimplenciaBps != null ? String(c.inadimplenciaBps / 100) : "");
    setFundo(centsToReaisStr(c.fundoReservaCentavos));
    setAssStatus(c.assembleiaStatus ?? "");
    setAssData(c.assembleiaData ?? "");
  }

  function inadimplenciaBps(): number | null {
    if (!inadimplencia.trim()) return null;
    const n = Number(inadimplencia.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }

  return (
    <LeadEditableCard
      title="Saúde financeira e assembleia"
      canEdit={canEdit}
      leadId={lead.id}
      view={[
        {
          label: "Arrecadação mensal",
          value:
            c.arrecadacaoMensalCentavos != null
              ? formatBrlFromCents(c.arrecadacaoMensalCentavos)
              : null,
        },
        {
          label: "Inadimplência",
          value:
            c.inadimplenciaBps != null
              ? `${(c.inadimplenciaBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
              : null,
        },
        {
          label: "Fundo de reserva",
          value:
            c.fundoReservaCentavos != null
              ? formatBrlFromCents(c.fundoReservaCentavos)
              : null,
        },
        {
          label: "Assembleia",
          value: c.assembleiaStatus
            ? (ASSEMBLEIA_STATUS_LABEL[c.assembleiaStatus as AssembleiaStatus] ??
              c.assembleiaStatus)
            : null,
        },
        { label: "Data da assembleia", value: formatDateBr(c.assembleiaData) },
      ]}
      edit={
        <FormGrid>
          <FormField label="Arrecadação mensal (R$)" htmlFor="fn-arr">
            <Input id="fn-arr" type="number" step="0.01" min="0" value={arrecadacao} onChange={(e) => setArrecadacao(e.currentTarget.value)} />
          </FormField>
          <FormField label="Inadimplência (%)" htmlFor="fn-inad">
            <Input id="fn-inad" type="number" step="0.01" min="0" max="100" value={inadimplencia} onChange={(e) => setInadimplencia(e.currentTarget.value)} />
          </FormField>
          <FormField label="Fundo de reserva (R$)" htmlFor="fn-fundo">
            <Input id="fn-fundo" type="number" step="0.01" min="0" value={fundo} onChange={(e) => setFundo(e.currentTarget.value)} />
          </FormField>
          <FormField label="Assembleia">
            <Select value={assStatus} onValueChange={(v) => setAssStatus(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="—">
                  {(v: unknown) =>
                    typeof v === "string" && v
                      ? (ASSEMBLEIA_STATUS_LABEL[v as AssembleiaStatus] ?? v)
                      : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ASSEMBLEIA_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ASSEMBLEIA_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Data da assembleia" htmlFor="fn-assdata">
            <Input id="fn-assdata" type="date" value={assData} onChange={(e) => setAssData(e.currentTarget.value)} />
          </FormField>
        </FormGrid>
      }
      validate={() => {
        const bps = inadimplenciaBps();
        return bps != null && (bps < 0 || bps > 10_000)
          ? "Inadimplência deve ficar entre 0 e 100%"
          : null;
      }}
      buildPayload={() => ({
        condominio: {
          arrecadacaoMensalCentavos: reaisToCents(arrecadacao),
          inadimplenciaBps: inadimplenciaBps(),
          fundoReservaCentavos: reaisToCents(fundo),
          assembleiaStatus: assStatus || null,
          assembleiaData: assData || null,
        },
      })}
      onSavedReset={reset}
    />
  );
}
