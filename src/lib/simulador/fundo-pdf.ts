import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
  setCharacterSpacing,
  type RGB,
} from "pdf-lib";

import { maskCnpj } from "@/lib/formatters/cpf-cnpj";
import { formatPhoneBr } from "@/lib/formatters/phone";

import {
  IOF_FUNDO,
  type LinhaSimulacaoFundo,
  type SimulacaoFundoResult,
  VALIDADE_SIMULACAO_FUNDO_DIAS,
} from "./fundo";

// ═══════════════════════════════════════════════════════════
// PDF da simulação do fundo — identidade da Musashi Capital
// (kit de marca v1.0, out/2026): cabeçalho de documento com a assinatura
// horizontal em Índigo à esquerda e informações à direita em Inter;
// Shippori Mincho SemiBold em títulos e números de destaque; rótulos em
// Ouro com espaçamento; Grafite em textos de apoio. Sem o ouro em relevo
// (o manual o reserva ao digital e o PDF pode ser impresso).
//
// Fontes e logo ficam em assets/fundo (TTF convertido dos .woff2 do kit —
// o pdf-lib não embute WOFF2) e entram no bundle via next.config.ts.
// ═══════════════════════════════════════════════════════════

/** Dados institucionais. CNPJ entra no rodapé quando o fundo tiver um. */
export const MARCA_FUNDO = {
  nome: "Musashi Capital",
  tipo: "Fundo de Investimento em Direitos Creditórios",
  cnpj: null as string | null,
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 48;
const MT = 44;
const CW = PAGE_W - MX * 2;

const C = {
  indigo: hex("#1B2440"),
  noite: hex("#141B30"),
  ouro: hex("#C49A4A"),
  ouroClaro: hex("#E6C77E"),
  papel: hex("#F3F1EC"),
  grafite: hex("#5A5F6B"),
  // Derivados para linhas e zebra: Papel e Grafite clareados, sem cor nova.
  linha: hex("#E2DED5"),
  zebra: hex("#F9F8F5"),
  apoioEscuro: hex("#AEB3C2"),
  white: rgb(1, 1, 1),
};

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// ───────────────────────── formatação ─────────────────────────

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(v)
    .replace(/ /g, " ");

const pct = (v: number, dec = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%";

const dataBr = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};

// ───────────────────────── primitivas ─────────────────────────

type Fontes = { titulo: PDFFont; texto: PDFFont; medio: PDFFont; forte: PDFFont };
type Peso = keyof Fontes;

type Ctx = { page: PDFPage; f: Fontes; logo: PDFImage | null };

type TextOpts = {
  size: number;
  peso?: Peso;
  color?: RGB;
  spacing?: number;
  align?: "left" | "right" | "center";
  width?: number;
};

function largura(ctx: Ctx, s: string, o: Pick<TextOpts, "size" | "peso" | "spacing">) {
  const sp = o.spacing ?? 0;
  return ctx.f[o.peso ?? "texto"].widthOfTextAtSize(s, o.size) + sp * Math.max(0, s.length - 1);
}

/** yTop = topo da linha de texto, medido de cima pra baixo. */
function text(ctx: Ctx, s: string, x: number, yTop: number, o: TextOpts) {
  const w = largura(ctx, s, o);
  let xx = x;
  if (o.align === "right") xx = x + (o.width ?? 0) - w;
  else if (o.align === "center") xx = x + ((o.width ?? 0) - w) / 2;
  if (o.spacing) ctx.page.pushOperators(setCharacterSpacing(o.spacing));
  ctx.page.drawText(s, {
    x: xx,
    y: PAGE_H - yTop - o.size * 0.8,
    size: o.size,
    font: ctx.f[o.peso ?? "texto"],
    color: o.color ?? C.indigo,
  });
  if (o.spacing) ctx.page.pushOperators(setCharacterSpacing(0));
  return w;
}

function quebra(ctx: Ctx, s: string, o: Pick<TextOpts, "size" | "peso">, maxW: number): string[] {
  const out: string[] = [];
  for (const par of s.split("\n")) {
    let l = "";
    for (const p of par.split(/\s+/).filter(Boolean)) {
      const cand = l ? `${l} ${p}` : p;
      if (!l || largura(ctx, cand, o) <= maxW) l = cand;
      else {
        out.push(l);
        l = p;
      }
    }
    out.push(l);
  }
  return out;
}

function paragrafo(ctx: Ctx, s: string, x: number, yTop: number, maxW: number, o: TextOpts & { lh?: number }) {
  const lh = o.lh ?? o.size * 1.5;
  const linhas = quebra(ctx, s, o, maxW);
  linhas.forEach((l, i) => text(ctx, l, x, yTop + i * lh, o));
  return linhas.length * lh;
}

/** Rótulo em caixa alta com espaçamento (padrão do manual). */
function rotulo(ctx: Ctx, s: string, x: number, yTop: number, o: Partial<TextOpts> = {}) {
  return text(ctx, s.toUpperCase(), x, yTop, {
    size: o.size ?? 6.4,
    peso: o.peso ?? "medio",
    color: o.color ?? C.ouro,
    spacing: o.spacing ?? 1.1,
    align: o.align,
    width: o.width,
  });
}

function caixa(ctx: Ctx, x: number, yTop: number, w: number, h: number, o: { r?: number; fill?: RGB; border?: RGB }) {
  const r = Math.min(o.r ?? 0, h / 2, w / 2);
  const p = r
    ? `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
    : `M 0 0 H ${w} V ${h} H 0 Z`;
  ctx.page.drawSvgPath(p, {
    x,
    y: PAGE_H - yTop,
    color: o.fill,
    borderColor: o.border,
    borderWidth: o.border ? 0.6 : undefined,
  });
}

function filete(ctx: Ctx, x1: number, x2: number, yTop: number, cor: RGB, esp = 0.5) {
  ctx.page.drawLine({ start: { x: x1, y: PAGE_H - yTop }, end: { x: x2, y: PAGE_H - yTop }, thickness: esp, color: cor });
}

// ───────────────────────── blocos ─────────────────────────

function cabecalho(ctx: Ctx, sim: SimulacaoFundoResult): number {
  // Assinatura horizontal com 150 pt (~53 mm) — acima do mínimo impresso de 45 mm.
  const logoW = 150;
  let logoH = 41;
  if (ctx.logo) {
    logoH = (ctx.logo.height / ctx.logo.width) * logoW;
    ctx.page.drawImage(ctx.logo, { x: MX, y: PAGE_H - MT - logoH, width: logoW, height: logoH });
  } else {
    text(ctx, "MUSASHI", MX, MT + 6, { size: 20, peso: "titulo", spacing: 2.4 });
    rotulo(ctx, "Capital", MX + 2, MT + 30, { color: C.indigo, spacing: 4 });
  }
  const yInfo = MT + logoH / 2 - 15;
  rotulo(ctx, "Simulação de crédito", MX, yInfo, { align: "right", width: CW });
  text(ctx, `Nº ${sim.codigo}`, MX, yInfo + 12, { size: 8, peso: "medio", align: "right", width: CW });
  text(ctx, `Emitida em ${dataBr(sim.geradaEm)}`, MX, yInfo + 23, { size: 8, color: C.grafite, align: "right", width: CW });

  const y = MT + logoH + 16;
  filete(ctx, MX, MX + CW, y, C.linha, 0.6);
  filete(ctx, MX, MX + 36, y, C.ouro, 1.4);
  return y + 26;
}

function rodape(ctx: Ctx, sim: SimulacaoFundoResult) {
  const y = PAGE_H - 40;
  filete(ctx, MX, MX + CW, y, C.linha, 0.6);
  const esquerda = [MARCA_FUNDO.nome, MARCA_FUNDO.tipo, MARCA_FUNDO.cnpj ? `CNPJ ${MARCA_FUNDO.cnpj}` : null]
    .filter(Boolean)
    .join(" · ");
  rotulo(ctx, esquerda, MX, y + 9, { color: C.grafite, size: 5.6, spacing: 0.9 });
  rotulo(ctx, `Simulação ${sim.codigo}`, MX, y + 9, { color: C.grafite, size: 5.6, spacing: 0.9, align: "right", width: CW });
}

type Fato = { label: string; valor: string; destaque?: boolean; peso: number };

/** Faixa de fatos sobre fundo Papel. O destaque fica numa linha só (encolhe se precisar). */
function fatos(ctx: Ctx, itens: Fato[], yTop: number): number {
  const pad = 14;
  const soma = itens.reduce((s, f) => s + f.peso, 0);
  const ws = itens.map((f) => (f.peso / soma) * CW);
  const tamanhos = itens.map((f, i) => {
    if (!f.destaque) return 9.4;
    let size = 16;
    while (size > 10 && largura(ctx, f.valor, { size, peso: "titulo" }) > ws[i]! - pad * 2) size -= 0.5;
    return size;
  });
  const linhas = itens.map((f, i) =>
    f.destaque ? [f.valor] : quebra(ctx, f.valor, { size: 9.4, peso: "medio" }, ws[i]! - pad * 2).slice(0, 2),
  );
  const alturaValor = Math.max(...linhas.map((l, i) => (itens[i]!.destaque ? 18 : l.length * 12.5)));
  const h = pad + 10 + 6 + alturaValor + pad - 2;
  caixa(ctx, MX, yTop, CW, h, { r: 6, fill: C.papel });
  let x = MX;
  itens.forEach((f, i) => {
    if (i > 0) x += ws[i - 1]!;
    if (i > 0) {
      ctx.page.drawLine({
        start: { x, y: PAGE_H - yTop - pad },
        end: { x, y: PAGE_H - yTop - h + pad },
        thickness: 0.5,
        color: C.linha,
      });
    }
    rotulo(ctx, f.label, x + pad, yTop + pad, { color: C.grafite, size: 5.8, spacing: 0.9 });
    linhas[i]!.forEach((l, j) =>
      text(ctx, l, x + pad, yTop + pad + (f.destaque ? 15 : 16) + j * 12.5, {
        size: tamanhos[i]!,
        peso: f.destaque ? "titulo" : "medio",
      }),
    );
  });
  return yTop + h;
}

/** Faixa em Noite com a parcela de destaque em Ouro Claro. */
function destaque(ctx: Ctx, sim: SimulacaoFundoResult, yTop: number): number {
  const l = sim.menorParcela;
  const unica = sim.linhas.length === 1;
  const h = 66;
  caixa(ctx, MX, yTop, CW, h, { r: 6, fill: C.noite });
  rotulo(ctx, unica ? "Parcela mensal" : "Parcela a partir de", MX + 20, yTop + 18, { color: C.ouroClaro, size: 6.4 });
  text(ctx, `${l.meses} meses · juros de ${pct(l.taxaAm)} ao mês`, MX + 20, yTop + 33, { size: 8.6, color: C.apoioEscuro });
  text(ctx, `Parcelas fixas · CET de ${pct(l.cetAa)} ao ano`, MX + 20, yTop + 45, { size: 8.6, color: C.apoioEscuro });

  const valor = brl(l.parcela);
  const sufixo = " / mês";
  const wSuf = largura(ctx, sufixo, { size: 10 });
  const wVal = largura(ctx, valor, { size: 26, peso: "titulo" });
  const xVal = MX + CW - 20 - wSuf - wVal;
  text(ctx, valor, xVal, yTop + 19, { size: 26, peso: "titulo", color: C.ouroClaro });
  text(ctx, sufixo, xVal + wVal, yTop + 30, { size: 10, color: C.apoioEscuro });
  return yTop + h;
}

type Col = {
  titulo: string;
  peso: number;
  align: "left" | "right";
  val: (l: LinhaSimulacaoFundo) => string;
  forte?: boolean;
};

function tabela(ctx: Ctx, sim: SimulacaoFundoResult, yTop: number): number {
  const comIof = sim.iof !== "nenhum";
  const cols: Col[] = [
    { titulo: "Prazo", peso: 0.12, align: "left", val: (l) => `${l.meses} meses` },
    { titulo: "Juros a.m.", peso: 0.12, align: "right", val: (l) => pct(l.taxaAm) },
    { titulo: "Juros a.a.", peso: 0.12, align: "right", val: (l) => pct(l.taxaAa) },
    { titulo: "Parcela mensal", peso: 0.18, align: "right", val: (l) => brl(l.parcela), forte: true },
    ...(comIof ? [{ titulo: "IOF", peso: 0.13, align: "right" as const, val: (l: LinhaSimulacaoFundo) => brl(l.iof) }] : []),
    { titulo: "Total das parcelas", peso: 0.2, align: "right", val: (l) => brl(l.totalPago) },
    { titulo: "CET a.a.", peso: 0.13, align: "right", val: (l) => pct(l.cetAa) },
  ];
  const soma = cols.reduce((s, c) => s + c.peso, 0);
  const ws = cols.map((c) => (c.peso / soma) * CW);
  const padX = 8;

  text(ctx, sim.linhas.length === 1 ? "Condições simuladas" : "Condições por prazo", MX, yTop, {
    size: 14,
    peso: "titulo",
  });
  let y = yTop + 26;
  let x = MX;
  cols.forEach((c, i) => {
    rotulo(ctx, c.titulo, x + padX, y, {
      color: C.grafite,
      size: 5.8,
      spacing: 0.7,
      align: c.align,
      width: ws[i]! - padX * 2,
    });
    x += ws[i]!;
  });
  y += 12;
  filete(ctx, MX, MX + CW, y, C.indigo, 0.8);

  const rowH = 22;
  sim.linhas.forEach((l, r) => {
    if (r % 2 === 1) ctx.page.drawRectangle({ x: MX, y: PAGE_H - y - rowH, width: CW, height: rowH, color: C.zebra });
    let cx = MX;
    cols.forEach((c, i) => {
      text(ctx, c.val(l), cx + padX, y + 7.5, {
        size: 8.6,
        peso: c.forte ? "forte" : "texto",
        color: c.forte ? C.indigo : C.grafite,
        align: c.align,
        width: ws[i]! - padX * 2,
      });
      cx += ws[i]!;
    });
    y += rowH;
    filete(ctx, MX, MX + CW, y, C.linha, 0.5);
  });
  return y;
}

function notas(ctx: Ctx, sim: SimulacaoFundoResult, yTop: number): number {
  const iof = IOF_FUNDO[sim.iof];
  const pctIof = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) + "%";
  const itens = [
    "Tabela Price: as parcelas são fixas do primeiro ao último mês, sem correção monetária.",
    sim.iof === "nenhum"
      ? "As parcelas não incluem IOF."
      : `O IOF estimado (${pctIof(iof.iofAdicionalPct)} sobre o valor + ${pctIof(iof.iofDiarioPct)} ao dia, limitado a 365 dias) é financiado junto com o crédito e já está nas parcelas. O valor do crédito chega integral.`,
    "CET (Custo Efetivo Total): reúne juros e IOF em uma única taxa anual. É o número certo para comparar propostas.",
  ];
  let y = yTop;
  for (const t of itens) {
    ctx.page.drawCircle({ x: MX + 2, y: PAGE_H - y - 4.6, size: 1.3, color: C.ouro });
    y += paragrafo(ctx, t, MX + 10, y, CW - 10, { size: 7.8, color: C.grafite, lh: 11.4 }) + 3;
  }
  return y;
}

function contato(ctx: Ctx, sim: SimulacaoFundoResult, yTop: number): number {
  const c = sim.contato;
  const meios = [c.whatsapp ? formatPhoneBr(c.whatsapp) : null, c.email].filter(Boolean).join("   ·   ");
  const h = meios ? 56 : 42;
  caixa(ctx, MX, yTop, CW, h, { r: 6, border: C.linha });
  rotulo(ctx, "Fale com quem preparou esta simulação", MX + 16, yTop + 13);
  text(ctx, c.nome, MX + 16, yTop + 25, { size: 11, peso: "titulo" });
  if (meios) text(ctx, meios, MX + 16, yTop + 40, { size: 8, color: C.grafite });
  return yTop + h;
}

function aviso(ctx: Ctx, sim: SimulacaoFundoResult, yTop: number): number {
  const especifico =
    sim.produto === "CONDOMINIO"
      ? "à análise de crédito do condomínio e à aprovação da contratação em assembleia"
      : "à análise de crédito e à avaliação do imóvel oferecido em garantia";
  const t = `Simulação ilustrativa, válida por ${VALIDADE_SIMULACAO_FUNDO_DIAS} dias, até ${dataBr(sim.validaAte)}. Não constitui proposta, oferta firme ou aprovação de crédito: a concessão está sujeita ${especifico}. Taxas e condições podem mudar após a análise. Não inclui tarifas, seguros, custos de avaliação, registro e garantias, informados na proposta formal.`;
  const o = { size: 7, color: C.grafite, lh: 10.4 } as const;
  const linhas = quebra(ctx, t, o, CW - 28);
  const h = linhas.length * o.lh + 18;
  caixa(ctx, MX, yTop, CW, h, { r: 6, fill: C.papel });
  ctx.page.drawRectangle({ x: MX, y: PAGE_H - yTop - h, width: 2, height: h, color: C.ouro });
  linhas.forEach((l, i) => text(ctx, l, MX + 16, yTop + 9 + i * o.lh, o));
  return yTop + h;
}

// ───────────────────────── documento ─────────────────────────

const ASSETS = path.join(process.cwd(), "assets", "fundo");

function ler(nome: string): Buffer {
  return fs.readFileSync(path.join(ASSETS, nome));
}

export function nomeArquivoSimulacaoFundo(sim: Pick<SimulacaoFundoResult, "codigo" | "cliente">): string {
  const nome = sim.cliente.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .toUpperCase();
  return `Musashi_Capital_Simulacao_${sim.codigo}_${nome || "CLIENTE"}.pdf`;
}

export async function renderSimulacaoFundoPdf(sim: SimulacaoFundoResult): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Simulação de crédito ${sim.codigo} — ${sim.cliente.nome}`);
  doc.setAuthor(MARCA_FUNDO.nome);
  doc.setSubject("Simulação de crédito");
  doc.setCreator(MARCA_FUNDO.nome);
  doc.setProducer(MARCA_FUNDO.nome);
  doc.setCreationDate(new Date());

  const [titulo, texto, medio, forte] = await Promise.all(
    ["ShipporiMincho-SemiBold.ttf", "Inter-Regular.ttf", "Inter-Medium.ttf", "Inter-SemiBold.ttf"].map((f) =>
      doc.embedFont(ler(f), { subset: true }),
    ),
  );
  let logo: PDFImage | null = null;
  try {
    logo = await doc.embedPng(ler("assinatura-horizontal-azul.png"));
  } catch {
    logo = null; // sem o arquivo, o cabeçalho cai no nome tipográfico
  }

  const ctx: Ctx = { page: doc.addPage([PAGE_W, PAGE_H]), f: { titulo: titulo!, texto: texto!, medio: medio!, forte: forte! }, logo };

  let y = cabecalho(ctx, sim);

  rotulo(ctx, MARCA_FUNDO.tipo, MX, y);
  y += 15;
  text(ctx, "Simulação de crédito", MX, y, { size: 26, peso: "titulo" });
  y += 36;
  const doc_ = sim.cliente.cnpj ? ` · CNPJ ${maskCnpj(sim.cliente.cnpj)}` : "";
  y += paragrafo(ctx, `Preparada para ${sim.cliente.nome}${doc_}`, MX, y, CW, { size: 10, peso: "medio", lh: 14 });
  y += 18;

  y =
    fatos(
      ctx,
      [
        { label: "Valor do crédito", valor: brl(sim.valorCredito), destaque: true, peso: 1.3 },
        {
          label: "Modalidade",
          valor: sim.produto === "CONDOMINIO" ? "Crédito para condomínio" : "Crédito com garantia de imóvel",
          peso: 1.1,
        },
        { label: "Amortização", valor: "Tabela Price", peso: 0.8 },
        { label: `Válida até (${VALIDADE_SIMULACAO_FUNDO_DIAS} dias)`, valor: dataBr(sim.validaAte), peso: 0.9 },
      ],
      y,
    ) + 14;

  y = destaque(ctx, sim, y) + 26;
  y = tabela(ctx, sim, y) + 14;
  y = notas(ctx, sim, y) + 14;
  y = contato(ctx, sim, y) + 10;
  aviso(ctx, sim, y);

  rodape(ctx, sim);
  return doc.save();
}
