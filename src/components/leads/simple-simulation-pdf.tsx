/* eslint-disable @next/next/no-img-element */
//
// Componente do PDF de simulação simplificada — portado direto do
// credios-website-v2 (src/components/sections/simple-simulation-pdf.tsx).
//
// Auto-contido: traz o próprio CSS de impressão via `<style>` injetado.
// Funciona com `window.print()` — `@media print` esconde tudo o resto da
// página e revela só `.simple-pdf`.
//
// Mantemos uma cópia idêntica em vez de importar de um pacote
// compartilhado pra evitar dependência cruzada entre os repos. Se o
// design do PDF mudar no site, atualizamos os dois.
//
import React from "react";
import {
  TrendingDown,
  Minus,
  Lock,
  TrendingUp,
  User,
  Home,
  Calculator,
} from "lucide-react";

import type { SimpleSimulationResult } from "@/lib/simulador/simple-simulator";

// ═══════════════════════════════════════════════════════════
// Paleta — restrita (azul Credios + cinzas + branco), sem gradientes.
// ═══════════════════════════════════════════════════════════
const COLOR = {
  primary: "#1E4FD6",
  darkBlue: "#0C2D7A",
  lightBlue: "#EEF3FD",
  black: "#111827",
  grayDark: "#4B5563",
  grayMid: "#6B7280",
  grayBorder: "#E5E7EB",
  grayZebra: "#F9FAFB",
  white: "#FFFFFF",
};

// ═══════════════════════════════════════════════════════════
// Formatadores locais (não importados do lib do CRM pra manter o
// PDF auto-contido nos seus estilos/decimais/separadores).
// ═══════════════════════════════════════════════════════════
const fmtCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const fmtCurrencyCompact = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const fmtPct = (value: number, decimals = 2) =>
  value.toFixed(decimals).replace(".", ",") + "%";

const fmtDateBr = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// CPF mascarado: XXX.***.***-XX (primeiro e último bloco visíveis).
const maskCPF = (cpf: string) => {
  const digits = (cpf ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return "Não informado";
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
};

// ═══════════════════════════════════════════════════════════
// CSS para impressão (A4, margens, quebras, fontes)
// ═══════════════════════════════════════════════════════════
const PRINT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');

.simple-pdf, .simple-pdf * {
  font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

.simple-pdf .pdf-page {
  background: ${COLOR.white};
  color: ${COLOR.black};
  font-size: 10pt;
  line-height: 1.5;
}

@page {
  size: A4;
  margin: 20mm;
}

@media print {
  html, body {
    background: ${COLOR.white} !important;
  }
  body * { visibility: hidden; }
  .simple-pdf, .simple-pdf * { visibility: visible; }
  .simple-pdf {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
  .simple-pdf .pdf-page {
    page-break-after: always;
  }
  .simple-pdf .pdf-page:last-child {
    page-break-after: auto;
  }
  .simple-pdf tr.amort-row,
  .simple-pdf .avoid-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .simple-pdf thead {
    display: table-header-group;
  }
  .simple-pdf tfoot {
    display: table-row-group;
  }
}

@media screen {
  .simple-pdf {
    background: #f3f4f6;
    padding: 24px 0;
  }
  .simple-pdf .pdf-page {
    width: 210mm;
    min-height: 297mm;
    padding: 20mm;
    margin: 0 auto 24px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }
}
`;

// ═══════════════════════════════════════════════════════════
// Subcomponentes
// ═══════════════════════════════════════════════════════════

function Divider() {
  return (
    <div
      style={{
        height: 0,
        borderTop: `0.5px solid ${COLOR.grayBorder}`,
        margin: "8px 0 12px",
      }}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "9pt",
        color: COLOR.grayMid,
        letterSpacing: "0.02em",
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <Icon size={18} strokeWidth={1.5} color={COLOR.black} />
      <h2
        style={{
          fontSize: "13pt",
          fontWeight: 500,
          color: COLOR.black,
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {children}
      </h2>
    </div>
  );
}

function Header({ data }: { data: SimpleSimulationResult }) {
  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          minHeight: "25mm",
        }}
      >
        <img
          src="/credios-logo.png"
          alt="Credios"
          style={{ height: "12mm", objectFit: "contain" }}
        />
        <div style={{ textAlign: "right", fontSize: "9pt", lineHeight: 1.6 }}>
          <div>
            <span style={{ color: COLOR.grayMid }}>Nº da simulação: </span>
            <span
              style={{
                color: COLOR.primary,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {data.simulationId}
            </span>
          </div>
          <div>
            <span style={{ color: COLOR.grayMid }}>Data: </span>
            <span style={{ color: COLOR.black }}>{fmtDateBr(data.generatedAt)}</span>
          </div>
          <div>
            <span style={{ color: COLOR.grayMid }}>Validade: </span>
            <span style={{ color: COLOR.black }}>{data.validityDays} dias</span>
          </div>
        </div>
      </div>
      <div
        style={{
          height: 0,
          borderTop: `0.5px solid ${COLOR.grayBorder}`,
          marginTop: 8,
        }}
      />
    </>
  );
}

function Title({ data }: { data: SimpleSimulationResult }) {
  return (
    <div style={{ margin: "14px 0 12px" }}>
      <div
        style={{
          fontSize: "18pt",
          fontWeight: 500,
          color: COLOR.black,
          lineHeight: 1.2,
        }}
      >
        Simulação para {data.clientName}
      </div>
      <div
        style={{
          fontSize: "10pt",
          fontWeight: 400,
          color: COLOR.grayMid,
          marginTop: 4,
        }}
      >
        Proposta indicativa sujeita à análise de crédito.
      </div>
    </div>
  );
}

function HeroBlock({ data }: { data: SimpleSimulationResult }) {
  const isPrice = data.amortizationType === "price";
  const isPre = data.indexation === "pre";
  const yearsLabel =
    data.installments >= 12
      ? ` (${(data.installments / 12).toFixed(data.installments % 12 === 0 ? 0 : 1)} anos)`
      : "";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.2fr 1fr 1fr",
        gap: 8,
        marginBottom: 16,
      }}
    >
      {/* Coluna 1 — Valor liberado */}
      <div
        style={{
          background: COLOR.white,
          border: `0.5px solid ${COLOR.grayBorder}`,
          borderRadius: 8,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Label>Valor liberado</Label>
        <div>
          <div style={{ fontSize: "18pt", fontWeight: 500, color: COLOR.black, lineHeight: 1.2 }}>
            {fmtCurrencyCompact(data.creditAmount)}
          </div>
          <div style={{ fontSize: "9pt", color: COLOR.grayMid, marginTop: 2 }}>
            total financiado: {fmtCurrencyCompact(data.financedAmount)}
          </div>
        </div>
      </div>

      {/* Coluna 2 — Parcela mensal (DESTAQUE) */}
      <div
        style={{
          background: COLOR.lightBlue,
          borderRadius: 8,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Label>
          <span style={{ color: COLOR.darkBlue }}>
            {isPrice ? "Parcela mensal" : "Primeira parcela"}
          </span>
        </Label>
        <div>
          <div
            style={{
              fontSize: "28pt",
              fontWeight: 500,
              color: COLOR.primary,
              lineHeight: 1.1,
            }}
          >
            {fmtCurrencyCompact(data.firstPayment)}
          </div>
          <div style={{ fontSize: "9pt", color: COLOR.darkBlue, marginTop: 4 }}>
            {isPrice
              ? "/mês — valor fixo"
              : `decresce até ${fmtCurrencyCompact(data.lastPayment)}`}
          </div>
        </div>
      </div>

      {/* Coluna 3 — Prazo */}
      <div
        style={{
          background: COLOR.white,
          border: `0.5px solid ${COLOR.grayBorder}`,
          borderRadius: 8,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Label>Prazo</Label>
        <div>
          <div style={{ fontSize: "18pt", fontWeight: 500, color: COLOR.black, lineHeight: 1.2 }}>
            {data.installments}
            <span style={{ fontSize: "11pt", fontWeight: 400, color: COLOR.grayDark, marginLeft: 4 }}>
              meses
            </span>
          </div>
          <div style={{ fontSize: "9pt", color: COLOR.grayMid, marginTop: 2 }}>
            {yearsLabel.trim() ? yearsLabel.replace(/^\s*\(|\)\s*$/g, "") : ""}
          </div>
        </div>
      </div>

      {/* Coluna 4 — Taxa de juros */}
      <div
        style={{
          background: COLOR.white,
          border: `0.5px solid ${COLOR.grayBorder}`,
          borderRadius: 8,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Label>Taxa de juros</Label>
        <div>
          <div style={{ fontSize: "18pt", fontWeight: 500, color: COLOR.black, lineHeight: 1.2 }}>
            {fmtPct(data.interestRate)} a.m.
          </div>
          <div style={{ fontSize: "9pt", color: COLOR.grayMid, marginTop: 2 }}>
            {isPre
              ? `${fmtPct(data.annualRate)} a.a.`
              : "+ IPCA (corrigido mensalmente)"}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalityBlock({ data }: { data: SimpleSimulationResult }) {
  const isPrice = data.amortizationType === "price";
  const isPre = data.indexation === "pre";

  const PaymentIcon = isPrice ? Minus : TrendingDown;
  const RateIcon = isPre ? Lock : TrendingUp;

  const paymentTitle = isPrice ? "Parcela fixa" : "Parcelas decrescentes";
  const paymentBody = isPrice
    ? "O mesmo valor de parcela do início ao fim do contrato."
    : "A primeira parcela é maior e diminui a cada mês. Você paga menos juros no total.";
  const paymentFoot = `Sistema de amortização: ${isPrice ? "Tabela Price" : "SAC"}`;

  const rateTitle = isPre ? "Taxa fixa" : "Taxa variável (juros + IPCA)";
  const rateBody = isPre
    ? "A taxa de juros não muda durante o contrato. A parcela é previsível."
    : "A parcela é corrigida pelo IPCA. Pode variar conforme a inflação.";
  const rateFoot = `Indexação: ${isPre ? "Pré-fixada" : "Pós-fixada (+ IPCA)"}`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        marginBottom: 16,
      }}
    >
      <ModalityCard
        icon={PaymentIcon}
        title={paymentTitle}
        body={paymentBody}
        foot={paymentFoot}
      />
      <ModalityCard
        icon={RateIcon}
        title={rateTitle}
        body={rateBody}
        foot={rateFoot}
      />
    </div>
  );
}

function ModalityCard({
  icon: Icon,
  title,
  body,
  foot,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  title: string;
  body: string;
  foot: string;
}) {
  return (
    <div
      style={{
        border: `0.5px solid ${COLOR.grayBorder}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon size={18} strokeWidth={1.5} color={COLOR.primary} />
        <div style={{ fontSize: "13pt", fontWeight: 500, color: COLOR.black }}>{title}</div>
      </div>
      <div style={{ fontSize: "10pt", color: COLOR.grayDark, lineHeight: 1.5 }}>{body}</div>
      <div style={{ fontSize: "9pt", color: COLOR.grayMid, marginTop: 8 }}>{foot}</div>
    </div>
  );
}

function ClientAndPropertyBlock({ data }: { data: SimpleSimulationResult }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        marginBottom: 16,
      }}
    >
      <div>
        <SectionTitle icon={User}>Dados do cliente</SectionTitle>
        <DefinitionList
          rows={[
            { label: "Nome", value: data.clientName },
            { label: "CPF", value: maskCPF(data.clientCPF) },
          ]}
        />
      </div>
      <div>
        <SectionTitle icon={Home}>Dados do imóvel</SectionTitle>
        <DefinitionList
          rows={[
            { label: "Valor avaliado", value: fmtCurrency(data.propertyValue) },
            {
              label: "Garantia (LTV)",
              value: `${fmtPct(data.ltv)} do imóvel`,
            },
          ]}
        />
      </div>
    </div>
  );
}

function DefinitionList({
  rows,
}: {
  rows: Array<{ label: string; value: string; emphasis?: boolean }>;
}) {
  return (
    <div>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "6px 0",
            borderBottom: i === rows.length - 1 ? "none" : `0.5px solid ${COLOR.grayBorder}`,
          }}
        >
          <span style={{ fontSize: "9pt", color: COLOR.grayMid }}>{row.label}</span>
          <span
            style={{
              fontSize: "10pt",
              color: COLOR.black,
              fontWeight: row.emphasis ? 500 : 400,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function FinancialDetailBlock({ data }: { data: SimpleSimulationResult }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <SectionTitle icon={Calculator}>Detalhamento financeiro</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 24,
        }}
      >
        <DefinitionList
          rows={[
            { label: "Valor do crédito (líquido)", value: fmtCurrency(data.creditAmount) },
            { label: "IOF estimado", value: fmtCurrency(data.iof) },
            {
              label: "Outras despesas estimadas",
              value: fmtCurrency(data.otherExpenses),
            },
            {
              label: "Valor total financiado",
              value: fmtCurrency(data.financedAmount),
              emphasis: true,
            },
          ]}
        />
        <DefinitionList
          rows={[
            { label: "Taxa de juros mensal", value: fmtPct(data.interestRate) + " a.m." },
            {
              label: "Taxa equivalente anual",
              value: fmtPct(data.annualRate) + " a.a.",
            },
            { label: "CET mensal", value: fmtPct(data.cet) + " a.m." },
            { label: "CET anual", value: fmtPct(data.annualCet) + " a.a." },
          ]}
        />
      </div>
    </div>
  );
}

function Page1Footer({ data }: { data: SimpleSimulationResult }) {
  const isPos = data.indexation === "pos";
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          fontSize: "8pt",
          color: COLOR.grayMid,
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        Esta simulação é indicativa e não constitui aprovação de crédito. Condições
        finais dependem de análise cadastral, jurídica e da avaliação do imóvel.
        {isPos && (
          <>
            {" "}
            As parcelas são corrigidas mensalmente pelo IPCA e o valor efetivo pago
            pode variar conforme a inflação do período.
          </>
        )}
      </div>
      <div
        style={{
          background: COLOR.primary,
          color: COLOR.white,
          padding: "10px 16px",
          borderRadius: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "9pt",
        }}
      >
        <span>credios.com.br</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span>contato@credios.com.br</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span>WhatsApp (47) 2017-1026</span>
      </div>
    </div>
  );
}

function TableSection({ data }: { data: SimpleSimulationResult }) {
  const isSac = data.amortizationType === "sac";
  const isPrice = data.amortizationType === "price";
  const sistemaLabel = isSac ? "SAC" : "Tabela Price";
  const indexLabel =
    data.indexation === "pre" ? "Pré-fixado" : "Pós-fixado (+ IPCA)";

  return (
    <section className="pdf-page">
      <div className="avoid-break">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="/credios-logo.png"
              alt="Credios"
              style={{ height: "8mm", objectFit: "contain" }}
            />
            <span style={{ fontSize: "9pt", color: COLOR.grayMid }}>
              Nº{" "}
              <span style={{ color: COLOR.primary, fontWeight: 500 }}>
                {data.simulationId}
              </span>
            </span>
          </div>
          <div style={{ fontSize: "9pt", color: COLOR.grayMid }}>
            Evolução das parcelas ·{" "}
            <span style={{ color: COLOR.black }}>{sistemaLabel}</span> ·{" "}
            <span style={{ color: COLOR.black }}>{indexLabel}</span>
          </div>
        </div>
        <div
          style={{
            height: 0,
            borderTop: `0.5px solid ${COLOR.grayBorder}`,
            marginBottom: 16,
          }}
        />

        {isSac && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <SacStat label="Primeira parcela" value={data.firstPayment} />
            <SacStat label="Parcela média" value={data.averagePayment} />
            <SacStat label="Última parcela" value={data.lastPayment} />
          </div>
        )}
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "9pt",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <thead>
          <tr style={{ background: COLOR.grayZebra }}>
            <Th align="center" width="8%">#</Th>
            <Th align="left" width="18%">Vencimento</Th>
            <Th align="right" width="18%">Amortização</Th>
            <Th align="right" width="16%">Juros</Th>
            <Th align="right" width="18%">Parcela</Th>
            <Th align="right" width="22%">Saldo devedor</Th>
          </tr>
        </thead>
        <tbody>
          {data.amortizationTable.map((row, i) => {
            const isZebra = i % 2 === 1;
            const isFirst = row.month === 1;
            const isLast = row.month === data.installments;
            const highlightPayment = isSac && (isFirst || isLast);
            return (
              <tr
                key={row.month}
                className="amort-row"
                style={{ background: isZebra ? COLOR.grayZebra : COLOR.white }}
              >
                <Td align="center">{row.month}</Td>
                <Td align="left">{row.dueDate}</Td>
                <Td
                  align="right"
                  weight={isPrice ? 500 : 400}
                  color={isPrice ? COLOR.black : COLOR.grayDark}
                >
                  {fmtCurrency(row.amortization)}
                </Td>
                <Td
                  align="right"
                  weight={isPrice ? 500 : 400}
                  color={isPrice ? COLOR.black : COLOR.grayDark}
                >
                  {fmtCurrency(row.interest)}
                </Td>
                <Td
                  align="right"
                  weight={highlightPayment ? 500 : 400}
                  color={isPrice ? COLOR.grayDark : COLOR.black}
                >
                  {fmtCurrency(row.payment)}
                </Td>
                <Td align="right">{fmtCurrency(row.balance)}</Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="avoid-break">
            <td
              colSpan={2}
              style={{
                padding: "8pt 6pt",
                fontWeight: 500,
                borderTop: `1px solid ${COLOR.black}`,
                fontSize: "9pt",
              }}
            >
              Totais
            </td>
            <td
              style={{
                padding: "8pt 6pt",
                textAlign: "right",
                fontWeight: 500,
                borderTop: `1px solid ${COLOR.black}`,
                fontSize: "9pt",
              }}
            >
              {fmtCurrency(data.totalAmortization)}
            </td>
            <td
              style={{
                padding: "8pt 6pt",
                textAlign: "right",
                fontWeight: 500,
                borderTop: `1px solid ${COLOR.black}`,
                fontSize: "9pt",
              }}
            >
              {fmtCurrency(data.totalInterest)}
            </td>
            <td
              style={{
                padding: "8pt 6pt",
                textAlign: "right",
                fontWeight: 500,
                borderTop: `1px solid ${COLOR.black}`,
                fontSize: "9pt",
              }}
            >
              {fmtCurrency(data.totalPaid)}
            </td>
            <td
              style={{
                padding: "8pt 6pt",
                textAlign: "right",
                fontWeight: 500,
                borderTop: `1px solid ${COLOR.black}`,
                fontSize: "9pt",
              }}
            >
              {fmtCurrency(0)}
            </td>
          </tr>
        </tfoot>
      </table>

      <div
        style={{
          marginTop: 16,
          fontSize: "8pt",
          color: COLOR.grayMid,
          textAlign: "center",
        }}
      >
        Simulação indicativa — valores sujeitos à análise de crédito.
      </div>
    </section>
  );
}

function Th({
  children,
  align,
  width,
}: {
  children: React.ReactNode;
  align: "left" | "right" | "center";
  width?: string;
}) {
  return (
    <th
      style={{
        textAlign: align,
        fontSize: "9pt",
        fontWeight: 500,
        color: COLOR.black,
        padding: "8pt 6pt",
        borderBottom: `1px solid ${COLOR.grayBorder}`,
        width,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  weight = 400,
  color = COLOR.black,
}: {
  children: React.ReactNode;
  align: "left" | "right" | "center";
  weight?: 400 | 500;
  color?: string;
}) {
  return (
    <td
      style={{
        textAlign: align,
        fontSize: "9pt",
        fontWeight: weight,
        color,
        padding: "6pt 6pt",
        lineHeight: 1.4,
      }}
    >
      {children}
    </td>
  );
}

function SacStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: `0.5px solid ${COLOR.grayBorder}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ fontSize: "9pt", color: COLOR.grayMid }}>{label}</div>
      <div
        style={{
          fontSize: "13pt",
          fontWeight: 500,
          color: COLOR.black,
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtCurrency(value)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Componente principal
// ═══════════════════════════════════════════════════════════
export function SimpleSimulationPDF({ data }: { data: SimpleSimulationResult }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="simple-pdf" id="simple-simulation-pdf">
        {/* Página 1 — resumo */}
        <section className="pdf-page">
          <Header data={data} />
          <Title data={data} />
          <HeroBlock data={data} />
          <ModalityBlock data={data} />
          <Divider />
          <ClientAndPropertyBlock data={data} />
          <FinancialDetailBlock data={data} />
          <Page1Footer data={data} />
        </section>

        {/* Páginas 2+ — tabela de amortização (quebra natural pelo browser) */}
        <TableSection data={data} />
      </div>
    </>
  );
}
