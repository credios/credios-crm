import fs from "fs";
import path from "path";
import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
  rgb,
  setCharacterSpacing,
  type RGB,
} from "pdf-lib";

import { maskCnpj } from "@/lib/formatters/cpf-cnpj";

import type { SimulacaoCondominioResult } from "./condominio";

// ═══════════════════════════════════════════════════════════
// PDF da simulação de crédito para condomínio (portal do parceiro).
//
// Mesma linguagem visual da proposta em faixa do CGI
// (src/components/leads/proposta-faixa-pdf.tsx): azul + grafite, filete azul
// sob o cabeçalho, grade de fatos em caixas finas, faixa azul de destaque,
// tabela zebrada, página 2 educativa. Aqui o PDF sai pronto do servidor
// (pdf-lib) — o parceiro baixa o arquivo, sem depender do "imprimir" do
// navegador, o que no celular é o caso comum.
//
// Helvetica (StandardFonts) só codifica WinAnsi: o texto passa por
// `ansi()` — nada de "≈", "→" ou emoji.
// ═══════════════════════════════════════════════════════════

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 42; // margem lateral
const MT = 40; // margem superior
const CW = PAGE_W - MX * 2;

const C = {
  primary: hex("#1E4FD6"),
  darkBlue: hex("#0C2D7A"),
  lightBlue: hex("#EEF3FD"),
  blueLine: hex("#C9D7F8"),
  black: hex("#111827"),
  grayDark: hex("#4B5563"),
  grayMid: hex("#6B7280"),
  graySoft: hex("#9CA3AF"),
  grayBorder: hex("#E5E7EB"),
  zebra: hex("#F9FAFB"),
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

const pct = (v: number, dec = 2) => v.toFixed(dec).replace(".", ",") + "%";

const dataBr = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const inteiro = (n: number) => n.toLocaleString("pt-BR");

/** Só o que o WinAnsi codifica; acento fora disso cai pra letra base. */
function ansi(s: string): string {
  let out = "";
  for (const ch of s.replace(/[  ]/g, " ")) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || "–—‘’“”•…€".includes(ch)) {
      out += ch;
      continue;
    }
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const b = base.codePointAt(0) ?? 0;
    out += base && ((b >= 0x20 && b <= 0x7e) || (b >= 0xa0 && b <= 0xff)) ? base : "";
  }
  return out;
}

// ───────────────────────── primitivas de desenho ─────────────────────────

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
};

/** y = topo da linha de texto (coordenada "de cima pra baixo"). */
function text(
  ctx: Ctx,
  s: string,
  x: number,
  yTop: number,
  o: { size: number; bold?: boolean; color?: RGB; spacing?: number; align?: "left" | "right" | "center"; width?: number },
) {
  const font = o.bold ? ctx.bold : ctx.font;
  const t = ansi(s);
  const w = largura(ctx, t, o.size, o.bold, o.spacing);
  let xx = x;
  if (o.align === "right") xx = x + (o.width ?? 0) - w;
  else if (o.align === "center") xx = x + ((o.width ?? 0) - w) / 2;
  if (o.spacing) ctx.page.pushOperators(setCharacterSpacing(o.spacing));
  ctx.page.drawText(t, {
    x: xx,
    y: PAGE_H - yTop - o.size * 0.8,
    size: o.size,
    font,
    color: o.color ?? C.black,
  });
  if (o.spacing) ctx.page.pushOperators(setCharacterSpacing(0));
  return w;
}

function largura(ctx: Ctx, s: string, size: number, bold?: boolean, spacing = 0) {
  const t = ansi(s);
  return (bold ? ctx.bold : ctx.font).widthOfTextAtSize(t, size) + spacing * Math.max(0, t.length - 1);
}

function quebra(ctx: Ctx, s: string, size: number, maxW: number, bold?: boolean): string[] {
  const linhas: string[] = [];
  for (const par of ansi(s).split("\n")) {
    let linha = "";
    for (const palavra of par.split(/\s+/).filter(Boolean)) {
      const cand = linha ? `${linha} ${palavra}` : palavra;
      if (largura(ctx, cand, size, bold) <= maxW || !linha) linha = cand;
      else {
        linhas.push(linha);
        linha = palavra;
      }
    }
    linhas.push(linha);
  }
  return linhas;
}

/** Parágrafo com quebra; devolve a altura usada. */
function paragrafo(
  ctx: Ctx,
  s: string,
  x: number,
  yTop: number,
  maxW: number,
  o: { size: number; lh?: number; bold?: boolean; color?: RGB },
): number {
  const lh = o.lh ?? o.size * 1.5;
  const linhas = quebra(ctx, s, o.size, maxW, o.bold);
  linhas.forEach((l, i) => text(ctx, l, x, yTop + i * lh, o));
  return linhas.length * lh;
}

/** Retângulo (cantos arredondados) com topo em yTop. */
function caixa(
  ctx: Ctx,
  x: number,
  yTop: number,
  w: number,
  h: number,
  o: { r?: number; fill?: RGB; border?: RGB; borderWidth?: number },
) {
  const r = Math.min(o.r ?? 0, h / 2, w / 2);
  const p = r
    ? `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
    : `M 0 0 H ${w} V ${h} H 0 Z`;
  ctx.page.drawSvgPath(p, {
    x,
    y: PAGE_H - yTop,
    color: o.fill,
    borderColor: o.border,
    borderWidth: o.border ? (o.borderWidth ?? 0.5) : undefined,
  });
}

function linha(ctx: Ctx, x1: number, x2: number, yTop: number, cor: RGB, esp = 0.5) {
  ctx.page.drawLine({
    start: { x: x1, y: PAGE_H - yTop },
    end: { x: x2, y: PAGE_H - yTop },
    thickness: esp,
    color: cor,
  });
}

/** Micro-rótulo em caixa alta com espaçamento, como no PDF do CGI. */
function rotulo(ctx: Ctx, s: string, x: number, yTop: number, o: { color?: RGB; size?: number; align?: "left" | "right"; width?: number } = {}) {
  return text(ctx, s.toUpperCase(), x, yTop, {
    size: o.size ?? 6.3,
    color: o.color ?? C.grayMid,
    spacing: 0.55,
    align: o.align,
    width: o.width,
  });
}

// ───────────────────────── blocos ─────────────────────────

function cabecalho(ctx: Ctx, sim: SimulacaoCondominioResult, direita: string[]): number {
  let y = MT;
  if (ctx.logo) {
    const h = 24;
    const w = (ctx.logo.width / ctx.logo.height) * h;
    ctx.page.drawImage(ctx.logo, { x: MX, y: PAGE_H - y - h, width: w, height: h });
  } else {
    text(ctx, "Credios", MX, y + 4, { size: 16, bold: true, color: C.primary });
  }
  direita.forEach((l, i) =>
    text(ctx, l, MX, y + 2 + i * 10.5, { size: 7.6, color: C.grayMid, align: "right", width: CW }),
  );
  y += 32;
  linha(ctx, MX, MX + CW, y, C.primary, 2);
  void sim;
  return y + 16;
}

function rodape(ctx: Ctx, pagina: string) {
  const y = PAGE_H - 50;
  linha(ctx, MX, MX + CW, y, C.grayBorder);
  const aviso =
    "Simulação preliminar, sujeita à análise de crédito e à aprovação em assembleia. Não constitui proposta formal nem aprovação de crédito.";
  paragrafo(ctx, aviso, MX, y + 7, CW * 0.68, { size: 6.4, color: C.graySoft, lh: 9 });
  text(ctx, `Credios · crédito para condomínios · ${pagina}`, MX, y + 7, {
    size: 6.6,
    color: C.grayMid,
    align: "right",
    width: CW,
  });
}

/** Faixa do parceiro — o "apresentado por", em destaque. */
function faixaParceiro(ctx: Ctx, sim: SimulacaoCondominioResult, yTop: number): number {
  const p = sim.parceiro;
  const contato = [p.responsavel, p.email, p.telefone].filter(Boolean).join("  ·  ");
  const h = contato ? 52 : 42;
  caixa(ctx, MX, yTop, CW, h, { r: 8, fill: C.lightBlue });
  ctx.page.drawRectangle({ x: MX, y: PAGE_H - yTop - h, width: 3, height: h, color: C.primary });
  rotulo(ctx, "Simulação apresentada por", MX + 16, yTop + 10, { color: C.primary });
  const nomeLinhas = quebra(ctx, p.nome, 13, CW - 170, true);
  text(ctx, nomeLinhas[0] ?? "", MX + 16, yTop + 21, { size: 13, bold: true, color: C.darkBlue });
  if (contato) text(ctx, contato, MX + 16, yTop + 37, { size: 7.8, color: C.grayDark });

  // Selo "Parceiro oficial Credios" à direita.
  selo(ctx, MX + CW - 14, yTop + h / 2);
  return yTop + h;
}

/** Selo em pílula, alinhado à direita em xDir e centrado verticalmente em yMeio. */
function selo(ctx: Ctx, xDir: number, yMeio: number) {
  const t = "Parceiro oficial Credios".toUpperCase();
  const tw = largura(ctx, t, 6.3, false, 0.55);
  const w = tw + 34;
  const h = 22;
  const x = xDir - w;
  const y = yMeio - h / 2;
  caixa(ctx, x, y, w, h, { r: 11, fill: C.white, border: C.blueLine, borderWidth: 0.8 });
  ctx.page.drawCircle({ x: x + 12, y: PAGE_H - yMeio, size: 2.6, color: C.primary });
  rotulo(ctx, t, x + 21, y + 8.2, { color: C.primary });
}

type Fato = { label: string; valor: string; forte?: boolean; span?: number };

/** Linha da grade de fatos: caixa fina, 4 colunas (span opcional). */
function gradeFatos(ctx: Ctx, fatos: Fato[], yTop: number): number {
  const col = CW / 4;
  const pad = 9;
  const larguras = fatos.map((f) => col * (f.span ?? 1));
  const linhasPorFato = fatos.map((f, i) => quebra(ctx, f.valor, 9.6, larguras[i]! - pad * 2, f.forte).slice(0, 2));
  const maxLinhas = Math.max(...linhasPorFato.map((l) => l.length));
  const h = 8 + 9 + 3 + maxLinhas * 12 + 6;
  caixa(ctx, MX, yTop, CW, h, { r: 7, border: C.grayBorder, borderWidth: 0.6 });
  let x = MX;
  fatos.forEach((f, i) => {
    rotulo(ctx, f.label, x + pad, yTop + 9);
    linhasPorFato[i]!.forEach((l, j) =>
      text(ctx, l, x + pad, yTop + 20 + j * 12, {
        size: 9.6,
        bold: f.forte,
        color: f.forte ? C.primary : C.black,
      }),
    );
    x += larguras[i]!;
    if (i < fatos.length - 1) {
      ctx.page.drawLine({
        start: { x, y: PAGE_H - yTop - 8 },
        end: { x, y: PAGE_H - yTop - h + 8 },
        thickness: 0.4,
        color: C.grayBorder,
      });
    }
  });
  return yTop + h;
}

function destaque(ctx: Ctx, sim: SimulacaoCondominioResult, yTop: number): number {
  const l = sim.menorParcela;
  const h = sim.numUnidades ? 54 : 44;
  caixa(ctx, MX, yTop, CW, h, { r: 8, fill: C.primary });
  rotulo(ctx, "Parcela a partir de", MX + 16, yTop + 13, { color: C.white, size: 6.8 });
  text(ctx, `${l.meses} meses · Tabela Price · ${pct(l.taxaAm)} a.m.`, MX + 16, yTop + 25, {
    size: 8,
    color: hex("#D6E0FA"),
  });
  const valor = brl(l.parcela);
  const sufixo = " / mês";
  const wSuf = largura(ctx, sufixo, 9.5);
  const wVal = largura(ctx, valor, 17, true);
  const xVal = MX + CW - 16 - wSuf - wVal;
  text(ctx, valor, xVal, yTop + 11, { size: 17, bold: true, color: C.white });
  text(ctx, sufixo, xVal + wVal, yTop + 17, { size: 9.5, color: hex("#D6E0FA") });
  if (sim.numUnidades && l.porUnidade != null) {
    text(ctx, `cerca de ${brl(l.porUnidade)} por unidade ao mês (${inteiro(sim.numUnidades)} unidades)`, MX, yTop + 35, {
      size: 7.8,
      color: hex("#D6E0FA"),
      align: "right",
      width: CW - 16,
    });
  }
  return yTop + h;
}

function tabela(ctx: Ctx, sim: SimulacaoCondominioResult, yTop: number): number {
  const comUnidade = sim.numUnidades != null;
  type Col = { titulo: string; w: number; align: "left" | "right"; val: (l: SimulacaoCondominioResult["linhas"][number]) => string; forte?: boolean };
  const cols: Col[] = [
    { titulo: "Prazo", w: 0, align: "left", val: (l) => `${l.meses} meses` },
    { titulo: "Taxa a.m.", w: 0, align: "right", val: (l) => pct(l.taxaAm) },
    { titulo: "Taxa a.a.", w: 0, align: "right", val: (l) => pct(l.taxaAa) },
    { titulo: "Parcela mensal", w: 0, align: "right", val: (l) => brl(l.parcela), forte: true },
    ...(comUnidade
      ? [{ titulo: "Por unidade", w: 0, align: "right" as const, val: (l: SimulacaoCondominioResult["linhas"][number]) => brl(l.porUnidade ?? 0) }]
      : []),
    { titulo: "Total a pagar", w: 0, align: "right", val: (l) => brl(l.totalPago) },
    { titulo: "CET a.m.", w: 0, align: "right", val: (l) => pct(l.cetAm) },
  ];
  const pesos = comUnidade ? [0.13, 0.11, 0.12, 0.18, 0.15, 0.19, 0.12] : [0.15, 0.13, 0.14, 0.22, 0.22, 0.14];
  cols.forEach((c, i) => (c.w = CW * pesos[i]!));

  rotulo(ctx, "Parcelas por prazo", MX, yTop, { color: C.darkBlue, size: 7.4 });
  let y = yTop + 15;
  const padX = 8;
  // cabeçalho
  let x = MX;
  for (const c of cols) {
    rotulo(ctx, c.titulo, x + padX, y, { align: c.align === "right" ? "right" : "left", width: c.w - padX * 2 });
    x += c.w;
  }
  y += 12;
  linha(ctx, MX, MX + CW, y, C.grayBorder, 0.9);
  const rowH = 19;
  sim.linhas.forEach((l, i) => {
    if (i % 2 === 1) ctx.page.drawRectangle({ x: MX, y: PAGE_H - y - rowH, width: CW, height: rowH, color: C.zebra });
    let cx = MX;
    for (const c of cols) {
      text(ctx, c.val(l), cx + padX, y + 6, {
        size: 8.8,
        bold: c.forte,
        color: c.forte ? C.black : C.grayDark,
        align: c.align,
        width: c.w - padX * 2,
      });
      cx += c.w;
    }
    y += rowH;
    linha(ctx, MX, MX + CW, y, C.grayBorder, 0.4);
  });
  return y;
}

function itemInfo(ctx: Ctx, n: number, titulo: string, corpo: string, yTop: number): number {
  text(ctx, `${n}.`, MX, yTop, { size: 8.8, bold: true, color: C.primary });
  text(ctx, titulo, MX + 14, yTop, { size: 9.6, bold: true });
  const h = paragrafo(ctx, corpo, MX + 14, yTop + 14, CW - 14, { size: 8.3, color: C.grayDark, lh: 12.4 });
  return yTop + 14 + h + 9;
}

// ───────────────────────── documento ─────────────────────────

function carregarLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "credios-logo.png"));
  } catch {
    return null;
  }
}

export function nomeArquivoSimulacaoCondominio(sim: Pick<SimulacaoCondominioResult, "codigo" | "condominioNome">): string {
  const nome = sim.condominioNome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .toUpperCase();
  return `Simulacao_${sim.codigo}_${nome || "CONDOMINIO"}.pdf`;
}

export async function renderSimulacaoCondominioPdf(sim: SimulacaoCondominioResult): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(ansi(`Simulação ${sim.codigo} — ${sim.condominioNome}`));
  doc.setAuthor("Credios");
  doc.setSubject("Simulação de crédito para condomínio");
  doc.setCreator(ansi(`Portal de Parceiros Credios — ${sim.parceiro.nome}`));
  doc.setProducer("Credios");
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = carregarLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;

  const taxaUnica = sim.taxaMinAm === sim.taxaMaxAm;
  const taxaTxt = taxaUnica ? `${pct(sim.taxaMinAm)} a.m.` : `${pct(sim.taxaMinAm)} a ${pct(sim.taxaMaxAm)} a.m.`;
  const prazosTxt = sim.prazoMin === sim.prazoMax ? `${sim.prazoMin} meses` : `${sim.prazoMin} a ${sim.prazoMax} meses`;

  // ═════════════ PÁGINA 1 — a simulação ═════════════
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_W, PAGE_H]), font, bold, logo };
  let y = cabecalho(ctx, sim, [
    `Data da simulação: ${dataBr(sim.geradaEm)}`,
    `Simulação ${sim.codigo} · válida até ${dataBr(sim.validaAte)}`,
  ]);

  y = faixaParceiro(ctx, sim, y) + 18;

  text(ctx, "Simulação de crédito para condomínio", MX, y, { size: 16, bold: true });
  y += 23;
  y +=
    paragrafo(
      ctx,
      `Preparada para ${sim.condominioNome}. Os valores abaixo mostram, para cada prazo, quanto o condomínio pagaria por mês para realizar o projeto sem chamada extra de uma só vez: o custo é diluído em parcelas fixas. Taxas, IOF e CET são estimativas e podem variar após a análise de crédito.`,
      MX,
      y,
      CW,
      { size: 8.4, color: C.grayDark, lh: 12.6 },
    ) + 10;

  y =
    gradeFatos(
      ctx,
      [
        { label: "Condomínio", valor: sim.condominioNome, span: 2 },
        { label: "CNPJ", valor: maskCnpj(sim.cnpj) },
        { label: "Nº de unidades", valor: sim.numUnidades ? inteiro(sim.numUnidades) : "Não informado" },
      ],
      y,
    ) + 8;
  y =
    gradeFatos(
      ctx,
      [
        { label: "Valor solicitado", valor: brl(sim.valorCredito), forte: true },
        { label: "Taxa de juros", valor: taxaTxt, forte: true },
        { label: "Prazos simulados", valor: prazosTxt },
        { label: "Finalidade", valor: sim.finalidade || "A definir" },
      ],
      y,
    ) + 12;

  y = destaque(ctx, sim, y) + 18;
  y = tabela(ctx, sim, y) + 10;

  const notaIof = sim.iofIncluido
    ? "As parcelas já incluem o IOF estimado, financiado junto com o crédito."
    : "As parcelas não incluem IOF.";
  const notaUnidade = sim.numUnidades
    ? ` "Por unidade" é a parcela dividida igualmente entre as ${inteiro(sim.numUnidades)} unidades; o rateio real segue a convenção do condomínio (fração ideal, por exemplo).`
    : "";
  y +=
    paragrafo(
      ctx,
      `Tabela Price: a parcela é a mesma do primeiro ao último mês. ${notaIof} O CET (Custo Efetivo Total) reúne juros e IOF em uma única taxa mensal.${notaUnidade}`,
      MX,
      y,
      CW,
      { size: 7.4, color: C.grayMid, lh: 11 },
    ) + 10;

  const avisoTxt =
    "Aviso. Simulação preliminar, sujeita à análise de crédito do condomínio e à aprovação da contratação em assembleia. As condições podem ser alteradas sem aviso prévio. Não contempla eventuais tarifas, custos de registro e garantias, informados na proposta formal após a análise.";
  const avisoLinhas = quebra(ctx, avisoTxt, 7.4, CW - 26);
  const avisoH = avisoLinhas.length * 11 + 14;
  caixa(ctx, MX, y, CW, avisoH, { r: 6, border: C.grayBorder });
  ctx.page.drawRectangle({ x: MX, y: PAGE_H - y - avisoH, width: 3, height: avisoH, color: C.primary });
  avisoLinhas.forEach((l, i) => {
    if (i === 0 && l.startsWith("Aviso.")) {
      const w = text(ctx, "Aviso.", MX + 13, y + 7 + i * 11, { size: 7.4, bold: true });
      text(ctx, l.slice("Aviso.".length), MX + 13 + w, y + 7 + i * 11, { size: 7.4, color: C.grayDark });
    } else {
      text(ctx, l, MX + 13, y + 7 + i * 11, { size: 7.4, color: C.grayDark });
    }
  });

  rodape(ctx, "1/2");

  // ═════════════ PÁGINA 2 — como funciona ═════════════
  ctx.page = doc.addPage([PAGE_W, PAGE_H]);
  y = cabecalho(ctx, sim, [`Data da simulação: ${dataBr(sim.geradaEm)}`, `Simulação ${sim.codigo} · informações complementares`]);

  text(ctx, "Como funciona o crédito para condomínios", MX, y, { size: 13, bold: true });
  y += 19;
  text(ctx, "O que o síndico e os condôminos precisam saber para decidir com segurança.", MX, y, {
    size: 8.4,
    color: C.grayDark,
  });
  y += 22;

  y = itemInfo(
    ctx,
    1,
    "Para que serve",
    "Financia obras e necessidades do condomínio — reforma, fachada e pintura, elevadores, impermeabilização, energia solar, segurança, individualização de água ou gás, quitação de dívidas — sem exigir dos condôminos uma chamada de capital de uma só vez. O custo é pago em parcelas mensais.",
    y,
  );
  y = itemInfo(
    ctx,
    2,
    "Aprovação em assembleia",
    "A contratação do crédito é decidida pelos condôminos em assembleia, conforme a convenção. A Credios ajuda o síndico com o material da operação e pode participar da assembleia para esclarecer dúvidas.",
    y,
  );
  y = itemInfo(
    ctx,
    3,
    "Rateio entre as unidades",
    "A parcela costuma ser rateada entre as unidades como cota extra, seguindo o critério da convenção. O valor \"por unidade\" desta simulação é uma divisão igual, para referência.",
    y,
  );
  y = itemInfo(
    ctx,
    4,
    "Crédito direto da Credios",
    "O crédito é concedido pelo fundo de investimento em direitos creditórios (FIDC) próprio da Credios. A nossa equipe analisa a saúde financeira do condomínio — arrecadação mensal, inadimplência, fundo de reserva e histórico — e define a taxa, o prazo e o valor finais.",
    y,
  );
  y = itemInfo(
    ctx,
    5,
    "Documentos para a análise",
    "Convenção do condomínio, ata de eleição do síndico, últimos 3 balancetes, relação de inadimplência e, quando já houver, a ata da assembleia que aprovou a contratação.",
    y,
  );
  y = itemInfo(
    ctx,
    6,
    "Taxa, IOF e CET",
    "A taxa de juros remunera a operação. O IOF é um imposto federal sobre operações de crédito. O CET (Custo Efetivo Total) reúne esses custos em uma única taxa e é o número certo para comparar propostas.",
    y,
  );

  // Próximos passos
  y += 4;
  rotulo(ctx, "Próximos passos", MX, y, { color: C.darkBlue, size: 7.4 });
  y += 14;
  const passos = [
    ["Apresente", "Leve esta simulação ao síndico e ao conselho."],
    ["Encaminhe", `${sim.parceiro.nome} envia o caso para a Credios.`],
    ["Analise", "A Credios analisa o condomínio e apresenta a proposta do seu fundo."],
    ["Aprove", "A assembleia aprova e o crédito é contratado."],
  ] as const;
  const pw = (CW - 3 * 8) / 4;
  const pLinhas = passos.map(([, d]) => quebra(ctx, d, 7.8, pw - 20));
  const ph = 30 + Math.max(...pLinhas.map((l) => l.length)) * 11 + 6;
  passos.forEach(([t], i) => {
    const px = MX + i * (pw + 8);
    caixa(ctx, px, y, pw, ph, { r: 7, border: C.grayBorder, borderWidth: 0.6 });
    ctx.page.drawCircle({ x: px + 18, y: PAGE_H - y - 17, size: 8, color: C.primary });
    text(ctx, String(i + 1), px + 10, y + 13, { size: 8, bold: true, color: C.white, align: "center", width: 16 });
    text(ctx, t, px + 31, y + 13, { size: 9, bold: true });
    pLinhas[i]!.forEach((l, j) => text(ctx, l, px + 10, y + 31 + j * 11, { size: 7.8, color: C.grayDark }));
  });
  y += ph + 16;

  // Bloco institucional
  const instTxt =
    "Há mais de 7 anos a Credios estrutura operações de crédito: já são mais de R$ 100 milhões originados para mais de 500 clientes, com 90% de taxa de aprovação. No crédito para condomínios, quem financia é o fundo próprio da Credios (FIDC): a mesma equipe cuida da análise, da proposta, do apoio na assembleia e da contratação, até o recurso estar disponível.";
  const instLinhas = quebra(ctx, instTxt, 8.3, CW - 32);
  const instH = 16 + 14 + instLinhas.length * 12.4 + 12 + 30 + 12;
  caixa(ctx, MX, y, CW, instH, { r: 8, fill: C.lightBlue });
  text(ctx, "Credios — do primeiro contato ao crédito contratado", MX + 16, y + 14, { size: 10, bold: true, color: C.darkBlue });
  instLinhas.forEach((l, i) => text(ctx, l, MX + 16, y + 30 + i * 12.4, { size: 8.3, color: C.grayDark }));
  const yStats = y + 30 + instLinhas.length * 12.4 + 10;
  [
    ["7+ anos", "de mercado"],
    ["R$ 100M+", "originados"],
    ["500+", "clientes atendidos"],
    ["90%", "de aprovação"],
  ].forEach(([n, l], i) => {
    const sx = MX + 16 + i * ((CW - 32) / 4);
    text(ctx, n!, sx, yStats, { size: 12, bold: true, color: C.primary });
    rotulo(ctx, l!, sx, yStats + 17, { size: 6.3 });
  });
  y += instH + 14;

  // Fecho com o parceiro (o contato do cliente é ele)
  const p = sim.parceiro;
  const contato = [p.email, p.telefone].filter(Boolean).join("  ·  ");
  const fechoH = contato ? 50 : 38;
  caixa(ctx, MX, y, CW, fechoH, { r: 8, border: C.blueLine, borderWidth: 0.8 });
  rotulo(ctx, "Fale com quem preparou esta simulação", MX + 16, y + 10, { color: C.primary });
  text(ctx, p.responsavel && p.responsavel !== p.nome ? `${p.responsavel} · ${p.nome}` : p.nome, MX + 16, y + 21, {
    size: 10.5,
    bold: true,
    color: C.darkBlue,
  });
  if (contato) text(ctx, contato, MX + 16, y + 34, { size: 7.8, color: C.grayDark });
  selo(ctx, MX + CW - 14, y + fechoH / 2);

  rodape(ctx, "2/2");

  return doc.save();
}
