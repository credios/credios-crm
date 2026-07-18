/* eslint-disable @next/next/no-img-element */
//
// PROPOSTA EM FAIXA — peça de 2 páginas (A4) no padrão de mercado:
// faixa de taxas (min–max), tabelas PRICE/SAC por prazo, CET, IOF,
// renda mínima sugerida e página educativa. Design Credios: paleta
// restrita (azul + grafite + branco), Inter, números tabulares,
// bordas finas, muito respiro. Auto-contido (CSS próprio via <style>),
// impresso com window.print().
//
import React from "react";

import type { PropostaFaixaResult, Range } from "@/lib/simulador/faixa";

const COLOR = {
  primary: "#1E4FD6",
  darkBlue: "#0C2D7A",
  lightBlue: "#EEF3FD",
  black: "#111827",
  grayDark: "#4B5563",
  grayMid: "#6B7280",
  graySoft: "#9CA3AF",
  grayBorder: "#E5E7EB",
  grayZebra: "#F9FAFB",
  white: "#FFFFFF",
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);

const fmtPct = (v: number, dec = 2) => v.toFixed(dec).replace(".", ",") + "%";

const fmtRangePct = (r: Range, dec = 2) =>
  `${fmtPct(r.min, dec)} – ${fmtPct(r.max, dec)}`;

const fmtDateBr = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const maskCPF = (cpf: string) => {
  const digits = (cpf ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
};

const PRINT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

.faixa-pdf, .faixa-pdf * {
  font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

.faixa-pdf .pdf-page {
  background: ${COLOR.white};
  color: ${COLOR.black};
  font-size: 9.5pt;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
}

@page { size: A4; margin: 14mm 16mm; }

@media print {
  html, body { background: ${COLOR.white} !important; }
  body * { visibility: hidden; }
  .faixa-pdf, .faixa-pdf * { visibility: visible; }
  .faixa-pdf { position: absolute; left: 0; top: 0; width: 100%; }
  .faixa-pdf .pdf-page { page-break-after: always; }
  .faixa-pdf .pdf-page:last-child { page-break-after: auto; }
  .faixa-pdf .avoid-break { page-break-inside: avoid; break-inside: avoid; }
}

@media screen {
  .faixa-pdf { background: #f3f4f6; padding: 24px 0; }
  .faixa-pdf .pdf-page {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 16mm;
    margin: 0 auto 24px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  }
}
`;

// ───────────────────────── subcomponentes ─────────────────────────

function Header({ data, right }: { data: string; right?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        paddingBottom: 10,
        borderBottom: `2px solid ${COLOR.primary}`,
        marginBottom: 16,
      }}
    >
      <img src="/credios-logo.png" alt="Credios" style={{ height: 26 }} />
      <div style={{ textAlign: "right", fontSize: "8pt", color: COLOR.grayMid, lineHeight: 1.45 }}>
        <div>Data da simulação: {data}</div>
        {right}
      </div>
    </div>
  );
}

function Footer({ pagina }: { pagina: string }) {
  return (
    <div style={{ marginTop: "auto", paddingTop: 12 }}>
      <div
        style={{
          borderTop: `0.5px solid ${COLOR.grayBorder}`,
          paddingTop: 8,
          fontSize: "7pt",
          color: COLOR.graySoft,
          lineHeight: 1.5,
        }}
      >
        Simulação preliminar, sujeita à análise de crédito. Taxa, prazo e valor final
        dependem da avaliação da instituição parceira e do perfil do cliente. Esta peça
        não constitui proposta formal nem aprovação de crédito.
        <span style={{ float: "right", color: COLOR.grayMid }}>
          Credios · crédito com garantia de imóvel · {pagina}
        </span>
      </div>
    </div>
  );
}

/** Célula do grid de fatos: micro-label + valor. */
function Fact({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div style={{ padding: "7px 10px" }}>
      <div
        style={{
          fontSize: "6.5pt",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLOR.grayMid,
          marginBottom: 2,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "10pt",
          fontWeight: strong ? 600 : 500,
          color: strong ? COLOR.primary : COLOR.black,
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FactGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="avoid-break"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        border: `0.5px solid ${COLOR.grayBorder}`,
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function TabelaFaixa({
  titulo,
  colunaParcela,
  linhas,
  extrai,
}: {
  titulo: string;
  colunaParcela: string;
  linhas: PropostaFaixaResult["linhas"];
  extrai: (l: PropostaFaixaResult["linhas"][number]) => Range;
}) {
  return (
    <div className="avoid-break" style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: "8pt",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLOR.darkBlue,
          marginBottom: 6,
        }}
      >
        {titulo}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
        <thead>
          <tr>
            <th style={thStyle}>Prazo</th>
            <th style={{ ...thStyle, textAlign: "right" }}>{colunaParcela}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const r = extrai(l);
            return (
              <tr
                key={l.prazo}
                style={l.destaque ? { background: COLOR.lightBlue } : undefined}
              >
                <td style={{ ...tdStyle, fontWeight: l.destaque ? 600 : 400 }}>
                  {l.prazo} meses
                  {l.destaque && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: "6.5pt",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: COLOR.primary,
                        fontWeight: 600,
                      }}
                    >
                      sugerido
                    </span>
                  )}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "right",
                    fontWeight: l.destaque ? 600 : 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtCurrency(r.min)}
                  <span style={{ color: COLOR.graySoft, fontWeight: 400 }}> a </span>
                  {fmtCurrency(r.max)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: "6.5pt",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLOR.grayMid,
  fontWeight: 500,
  padding: "4px 8px",
  borderBottom: `1px solid ${COLOR.grayBorder}`,
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: `0.5px solid ${COLOR.grayBorder}`,
};

function InfoItem({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="avoid-break" style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 2 }}>
        <span
          style={{
            fontSize: "8.5pt",
            fontWeight: 600,
            color: COLOR.primary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {numero}.
        </span>
        <span style={{ fontSize: "9.5pt", fontWeight: 600, color: COLOR.black }}>
          {titulo}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: "8.5pt", color: COLOR.grayDark, lineHeight: 1.55 }}>
        {children}
      </p>
    </div>
  );
}

// ───────────────────────── componente principal ─────────────────────────

export function PropostaFaixaPDF({ data }: { data: PropostaFaixaResult }) {
  const primeiro = data.clientName.trim().split(/\s+/)[0] ?? data.clientName;
  const dataBr = fmtDateBr(data.generatedAt);
  const cpfMask = maskCPF(data.clientCPF);
  const idxSufixo = data.indexation === "pos" ? " + IPCA" : "";

  return (
    <div className="faixa-pdf">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* ═════════════ PÁGINA 1 — a proposta ═════════════ */}
      <div className="pdf-page">
        <Header
          data={dataBr}
          right={
            <div>
              Proposta {data.simulationId} · válida até {fmtDateBr(data.validUntil)}
            </div>
          }
        />

        <div style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: "16pt", fontWeight: 600, letterSpacing: "-0.01em" }}>
            Olá, {primeiro}!
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "8.5pt", color: COLOR.grayDark, lineHeight: 1.55 }}>
            Aqui está o resultado da sua simulação de crédito com garantia de imóvel.
            Os valores de crédito, Custo Efetivo Total (CET), taxas, seguros e impostos
            estão sujeitos à análise de crédito e podem variar conforme a avaliação do
            imóvel e do seu perfil. Esta é uma estimativa preliminar, gratuita e sem
            compromisso.
          </p>
        </div>

        {/* Grid de fatos */}
        <FactGrid>
          <Fact label="Nome" value={data.clientName} />
          <Fact label="Tipo" value={data.tipoPessoa} />
          <Fact label="Modalidade" value={data.modalidadeLabel} />
          <Fact label="Garantia" value="Imóvel próprio" />
        </FactGrid>
        <FactGrid>
          <Fact label="Valor líquido" value={fmtCurrency(data.creditAmount)} strong />
          <Fact label="IOF" value={fmtCurrency(data.iof)} />
          <Fact label="Total tomado" value={fmtCurrency(data.totalTomado)} />
          <Fact label="Prazo máximo" value={`${data.prazoMaximo} meses`} />
        </FactGrid>
        <FactGrid>
          <Fact label={`Taxa estimada (a.m.)${idxSufixo}`} value={fmtRangePct(data.taxaAm)} strong />
          <Fact label="Taxa estimada (a.a.)" value={fmtRangePct(data.taxaAa)} />
          <Fact label="CET estimado (a.m.)" value={fmtRangePct(data.cetAm)} />
          <Fact label="CET estimado (a.a.)" value={fmtRangePct(data.cetAa)} />
        </FactGrid>
        <FactGrid>
          <Fact label="Sistemas" value="PRICE / SAC" />
          <Fact
            label="Renda mín. sugerida"
            value={fmtCurrency(data.rendaMinimaSugerida)}
          />
          <Fact
            label="Comprometimento base"
            value={`${data.comprometimentoRendaPct}% da renda`}
          />
          <Fact label="LTV" value={fmtPct(data.ltv, 1)} />
        </FactGrid>

        {/* Destaque — faixa de parcela do cenário sugerido */}
        <div
          className="avoid-break"
          style={{
            background: COLOR.primary,
            color: COLOR.white,
            borderRadius: 8,
            padding: "12px 16px",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            margin: "6px 0 14px",
          }}
        >
          <div
            style={{
              fontSize: "7pt",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              opacity: 0.85,
              maxWidth: "38%",
              lineHeight: 1.5,
            }}
          >
            Faixa estimada de parcela
            <br />
            {data.prazoDestaque} meses · Price
          </div>
          <div style={{ fontSize: "15pt", fontWeight: 600, whiteSpace: "nowrap" }}>
            {fmtCurrency(data.parcelaDestaque.min)}
            <span style={{ opacity: 0.6, fontWeight: 400, fontSize: "10pt" }}> a </span>
            {fmtCurrency(data.parcelaDestaque.max)}
          </div>
        </div>

        {/* Tabelas PRICE / SAC lado a lado */}
        <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
          <TabelaFaixa
            titulo="Tabela Price"
            colunaParcela="Parcela mensal"
            linhas={data.linhas}
            extrai={(l) => l.price}
          />
          <TabelaFaixa
            titulo="Tabela SAC"
            colunaParcela="1ª parcela"
            linhas={data.linhas}
            extrai={(l) => l.sacPrimeira}
          />
        </div>

        <p style={{ margin: "0 0 10px", fontSize: "7.5pt", color: COLOR.grayMid, lineHeight: 1.55 }}>
          Os valores em faixa (R$ X a R$ Y) representam a variação conforme a faixa de
          taxa estimada ({fmtRangePct(data.taxaAm)} a.m.{idxSufixo}), e não a evolução
          temporal da parcela. Na PRICE, a parcela é constante do início ao fim. Na SAC,
          a parcela decresce ao longo do contrato (1ª maior, última menor). A linha de{" "}
          {data.prazoDestaque} meses está destacada como cenário sugerido.
          {cpfMask ? ` CPF do titular: ${cpfMask}.` : ""}
        </p>

        <div
          className="avoid-break"
          style={{
            border: `0.5px solid ${COLOR.grayBorder}`,
            borderLeft: `3px solid ${COLOR.primary}`,
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: "7.5pt",
            color: COLOR.grayDark,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: COLOR.black }}>Aviso.</strong> Trata-se de simulação
          preliminar, sujeita à análise de crédito. As condições podem ser alteradas a
          qualquer tempo, sem aviso prévio. Não contempla custos operacionais, impostos
          e cartório, informados na proposta formal após a análise.
        </div>

        <Footer pagina="1/2" />
      </div>

      {/* ═════════════ PÁGINA 2 — informações ═════════════ */}
      <div className="pdf-page">
        <Header data={dataBr} right={<div>Informações complementares</div>} />

        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: "13pt", fontWeight: 600, letterSpacing: "-0.01em" }}>
            Entenda a sua simulação
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: "8.5pt", color: COLOR.grayDark }}>
            Os principais conceitos para você comparar propostas com segurança.
          </p>
        </div>

        <InfoItem numero={1} titulo="Parcela">
          É o valor pago mensalmente que reduz o seu saldo devedor, composta por
          amortização + juros. A amortização abate a dívida; os juros remuneram a
          operação e variam por instituição, produto, perfil e prazo.
        </InfoItem>
        <InfoItem numero={2} titulo="Prestação">
          É o valor total do boleto mensal: a parcela (amortização + juros) somada aos
          seguros obrigatórios (MIP e DFI) e à tarifa mensal de administração da
          instituição.
        </InfoItem>
        <InfoItem numero={3} titulo="Tabela Price vs. Tabela SAC">
          Na PRICE as parcelas são constantes do início ao fim. Na SAC a primeira
          parcela é maior e diminui ao longo do contrato — exige mais renda no começo,
          mas o custo total tende a ser menor. A escolha depende do seu fluxo de caixa.
        </InfoItem>
        <InfoItem numero={4} titulo="Seguros MIP e DFI">
          São obrigatórios em operações com garantia de imóvel. O MIP (Morte e Invalidez
          Permanente) quita o saldo devedor em caso de falecimento ou invalidez do
          contratante. O DFI (Danos Físicos ao Imóvel) protege contra incêndio,
          alagamento, desmoronamento e eventos similares.
        </InfoItem>
        <InfoItem numero={5} titulo="CET — Custo Efetivo Total">
          O CET reúne em uma única taxa todos os custos da operação: juros, IOF, seguros
          e tarifas. É o número correto para comparar propostas de instituições
          diferentes — taxas isoladas podem enganar quando há tarifas ou seguros
          embutidos.
        </InfoItem>
        <InfoItem numero={6} titulo="IOF e demais custos">
          O IOF é um imposto federal sobre operações de crédito (estimado nesta
          simulação). Custos de cartório, avaliação do imóvel e despesas operacionais
          não estão incluídos e serão informados na proposta formal após a análise.
        </InfoItem>
        <InfoItem numero={7} titulo="Por que a taxa é apresentada como faixa?">
          A taxa final é definida pela instituição após a análise do seu perfil, da
          renda comprovada e da avaliação do imóvel. Nesta simulação trabalhamos com a
          modalidade {data.modalidadeLabel.toLowerCase()}, com faixa estimada de{" "}
          {fmtRangePct(data.taxaAm)} a.m.{idxSufixo} — a posição exata dentro dessa
          faixa depende da operação aprovada.
        </InfoItem>

        {/* Bloco institucional Credios */}
        <div
          className="avoid-break"
          style={{
            background: COLOR.lightBlue,
            borderRadius: 8,
            padding: "14px 16px",
            marginTop: 6,
          }}
        >
          <div style={{ fontSize: "10pt", fontWeight: 600, color: COLOR.darkBlue, marginBottom: 4 }}>
            Assessoria Credios — do primeiro contato ao crédito na conta
          </div>
          <p style={{ margin: 0, fontSize: "8.5pt", color: COLOR.grayDark, lineHeight: 1.6 }}>
            Há mais de 7 anos a Credios estrutura operações de crédito com garantia de
            imóvel: já foram mais de R$ 100 milhões originados para centenas de famílias
            e empresas, com 90% de taxa de aprovação. Nosso time leva o seu caso a mais
            de 15 instituições parceiras, coloca as propostas para competir, negocia
            taxas e condições e acompanha cada etapa — análise, avaliação do imóvel,
            cartório — até o recurso cair na sua conta. Simular, comparar e negociar
            não custa nada para você.
          </p>
          <div style={{ display: "flex", gap: 24, marginTop: 10 }}>
            {[
              ["R$ 100M+", "originados"],
              ["500+", "clientes atendidos"],
              ["90%", "de aprovação"],
              ["30+", "bancos parceiros"],
            ].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontSize: "12pt", fontWeight: 600, color: COLOR.primary }}>{n}</div>
                <div style={{ fontSize: "7pt", letterSpacing: "0.06em", textTransform: "uppercase", color: COLOR.grayMid }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Footer pagina="2/2" />
      </div>
    </div>
  );
}
