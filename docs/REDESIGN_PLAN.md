# Plano de Redesign — CRM Credios

> **Status**: planejamento aprovado. Brand identity travada (Credios oficial). Decisões 1-7 confirmadas pelo owner. Próximo passo: implementação Fase D1.

> **Tagline do redesign**: **Calmo. Denso. Confiável.** O CRM Credios deve parecer um produto que opera dinheiro de verdade — não um SaaS de marketing colorido. Densidade controlada (Linear), polidez nos materiais (Apple), calma minimalista (Notion), credibilidade financeira (Stripe). **Identidade Credios** (azul fintech + gold consulting + ivory warmth + charcoal anchor).

---

## 0. Princípios diretores

Os 5 princípios não-negociáveis que guiam toda decisão visual:

1. **Honestidade da informação acima de decoração.** Cada pixel decorativo precisa justificar o custo cognitivo. Glassmorphism só onde HÁ algo atrás pra borrar; gradientes só pra hierarquia, nunca pra "encher" espaço.
2. **Densidade controlada.** Usuários do CRM são power users (Gabriel, Rodrigo, futuros consultores) — eles vão olhar pra esse sistema 6h/dia. Linear-tier density por default; "comfortable" pra novatos como toggle.
3. **Movimento físico, não decorativo.** Tudo que se move responde a ação direta do usuário (drag, click, hover). Spring curves, não ease-out genérico. Respeitar `prefers-reduced-motion`.
4. **Material consistente.** Quatro níveis de surface (solid → frosted → vibrant → ethereal) usados sistematicamente — não improvisar `bg-white/80 backdrop-blur` por componente.
5. **Acessibilidade primeiro, estética depois.** AAA quando possível, AA mínimo. Glassmorphism nunca pode reduzir contraste de texto abaixo de 4.5:1.

---

## 1. Inspirações e o que pegar de cada

| Produto | O que pegar |
|---|---|
| **Linear** | Densidade compacta · atalhos de teclado em tudo · sidebar com hierarquia visual sutil · animação de status (check pulsa quando completa) · "instantaneidade" via optimistic updates · hover reveal de ações · monoespaçada pra números/IDs |
| **Notion** | Calma minimalista · grayscale-first com accent só onde importa · empty states com humor leve · drag handles só on hover · "everything is a block" feeling — cada seção tem cantinho arredondado e borda sutil · tipografia generosa com line-height confortável |
| **Apple HIG (macOS Sonoma+)** | Materiais translúcidos vibrantes · sidebar com "vibrancy" (saturação que adapta ao fundo) · springs em todas animações · hairline borders 0.5px · hierarquia via `materials` (regular, thick, thin, ultraThin) |
| **Stripe Dashboard** | Dados financeiros densos com clareza · KPIs grandes + sparklines · tabelas com hover row sutil · cores semânticas restritas (verde/vermelho/cinza) · breadcrumbs e contexto em todo lugar |
| **Pitch / Notion Calendar** | Reports e charts com gradientes refinados · curvas suaves nos gráficos · paleta harmônica nos status |
| **Raycast** | Command palette com qualidade premium — categorias, ícones, hints de atalho, recent items · spring scale-in |
| **Cron** | Agenda densa mas legível · color coding sem ruído |
| **Site Credios v2** | Paleta oficial · combinação Plus Jakarta + Fraunces + Space Grotesk · uso parcimonioso do gold · ivory como base "warm tech" · charcoal como anchor |

**Refs visuais pra carregar antes de começar**:
- <https://linear.app> (e changelog em /changelog)
- <https://www.notion.so> (workspace setup screens)
- <https://stripe.com/dashboard>
- <https://vercel.com/dashboard>
- <https://www.raycast.com>
- <https://developer.apple.com/design/human-interface-guidelines/materials>
- **Site Credios v2** (`credios-website-v2/src/app/globals.css` + `layout.tsx` — fonte da verdade do brand)

---

## 2. Identidade visual — **Credios oficial** ✅

Brand identity travada, extraída de `credios-website-v2`. O CRM herda 100% das cores e fontes do site institucional. Coerência entre site público + CRM interno reforça percepção de produto único.

### 2.1 Paleta primária (4 cores Credios)

```css
/* Credios Brand — Tailwind 4 @theme */
--color-credios-blue:     #4B7BE5;   /* Primary — fintech consulting */
--color-credios-gold:     #D4A351;   /* Accent — premium / aprovação */
--color-credios-ivory:    #F8F6F0;   /* Base bg warm — "linen" feeling */
--color-credios-charcoal: #141E30;   /* Text / anchor / dark mode bg */
```

**Direção declarada no CSS do site**: *"lighter, more modern 'fintech consulting' tones"*. O blue antigo (#1E3A5F) era navy bancário; o atual (#4B7BE5) é mais moderno, conecta a Stripe/Wise/Brex. O gold antigo (#C9963B) foi clareado pra #D4A351, mais ouro polido que ouro empoeirado.

### 2.2 Escalas derivadas (OKLCH-based)

Cada cor primária recebe escala de 11 stops (50 → 950) gerada via OKLCH com lightness controlada e chroma reduzido nos extremos. Permite tinges sutis (chip soft) e contrastes fortes (text on hover).

```css
/* Blue scale — pivot em 500 = #4B7BE5 ≈ oklch(0.62 0.17 264) */
--color-blue-50:   #EEF3FE;   oklch(0.97 0.02 264)
--color-blue-100:  #DCE6FD;   oklch(0.93 0.04 264)
--color-blue-200:  #BCCFFB;   oklch(0.86 0.08 264)
--color-blue-300:  #91B0F6;   oklch(0.77 0.13 264)
--color-blue-400:  #6E94EE;   oklch(0.69 0.16 264)
--color-blue-500:  #4B7BE5;   oklch(0.62 0.17 264)   ← Credios blue
--color-blue-600:  #3863CC;   oklch(0.54 0.17 264)
--color-blue-700:  #2C4FA8;   oklch(0.45 0.16 264)
--color-blue-800:  #213D80;   oklch(0.36 0.13 264)
--color-blue-900:  #182C5C;   oklch(0.28 0.10 264)
--color-blue-950:  #0F1B3D;   oklch(0.20 0.07 264)

/* Gold scale — pivot em 500 = #D4A351 ≈ oklch(0.74 0.13 75) */
--color-gold-50:   #FBF6EB;   oklch(0.97 0.02 75)
--color-gold-100:  #F6EBD1;   oklch(0.94 0.05 75)
--color-gold-200:  #ECD7A2;   oklch(0.88 0.09 75)
--color-gold-300:  #E1BE73;   oklch(0.81 0.12 75)
--color-gold-400:  #D9B05F;   oklch(0.77 0.13 75)
--color-gold-500:  #D4A351;   oklch(0.74 0.13 75)    ← Credios gold
--color-gold-600:  #B8893A;   oklch(0.65 0.13 75)
--color-gold-700:  #95702E;   oklch(0.55 0.11 75)
--color-gold-800:  #735524;   oklch(0.45 0.09 75)
--color-gold-900:  #4F3A15;   oklch(0.34 0.06 75)
--color-gold-950:  #2D2008;   oklch(0.22 0.04 75)

/* Charcoal scale — pivot em 800 = #141E30 ≈ oklch(0.20 0.04 260) */
--color-charcoal-50:   #E8EAEF;   oklch(0.92 0.01 260)
--color-charcoal-100:  #C9CDD8;   oklch(0.83 0.02 260)
--color-charcoal-200:  #9BA3B4;   oklch(0.69 0.03 260)
--color-charcoal-300:  #6E7891;   oklch(0.55 0.04 260)
--color-charcoal-400:  #4D5670;   oklch(0.42 0.04 260)
--color-charcoal-500:  #353D55;   oklch(0.33 0.04 260)
--color-charcoal-600:  #252D43;   oklch(0.26 0.04 260)
--color-charcoal-700:  #1B2438;   oklch(0.22 0.04 260)
--color-charcoal-800:  #141E30;   oklch(0.20 0.04 260)   ← Credios charcoal
--color-charcoal-900:  #0E1623;   oklch(0.16 0.03 260)
--color-charcoal-950:  #060A14;   oklch(0.10 0.02 260)

/* Ivory scale — pivot base = #F8F6F0 ≈ oklch(0.97 0.01 85) */
--color-ivory-base:      #F8F6F0;   oklch(0.97 0.01 85)   ← Credios ivory
--color-ivory-elevated:  #FFFFFF;   oklch(1.00 0.00 0)
--color-ivory-muted:     #F0EDE5;   oklch(0.94 0.01 85)
--color-ivory-subtle:    #E8E4D9;   oklch(0.90 0.02 85)
```

> **Por que essas escalas**: gerei cada stop em OKLCH preservando o chroma máximo no pivot e reduzindo nos extremos pra evitar "neon" no 50/100 e "lama" no 950. Resultado mantém identidade Credios em todas as opacities.

### 2.3 Selection / detalhes herdados do site

```css
::selection { 
  background: color-mix(in oklch, var(--color-credios-gold) 30%, transparent);
  color: var(--color-credios-charcoal);
}
```

Caret, focus rings, scrollbar thumb também usam blue-500 com 20-40% opacity.

---

## 3. Sistema de design — fundamentos

### 3.1 Cores semânticas

Mapeamento entre brand Credios + tokens semânticos da UI. Esses tokens são o que componentes consomem (nunca cor crua direto). Permite dark mode + tema sem refactor.

```css
/* Light mode — base ivory + charcoal text */
--bg-base:        var(--color-ivory-base);       /* #F8F6F0 — warm canvas */
--bg-elevated:    var(--color-ivory-elevated);   /* #FFFFFF — cards */
--bg-muted:       var(--color-ivory-muted);      /* #F0EDE5 — sub-cards */
--bg-subtle:      var(--color-ivory-subtle);     /* #E8E4D9 — table headers */

--fg-base:        var(--color-charcoal-800);     /* #141E30 — text primário */
--fg-muted:       var(--color-charcoal-500);     /* #353D55 — text secundário */
--fg-subtle:      var(--color-charcoal-300);     /* #6E7891 — captions */
--fg-faint:       var(--color-charcoal-200);     /* #9BA3B4 — placeholders */

--border-subtle:  color-mix(in oklch, var(--color-charcoal-800) 8%, transparent);
--border-base:    color-mix(in oklch, var(--color-charcoal-800) 12%, transparent);
--border-strong:  color-mix(in oklch, var(--color-charcoal-800) 18%, transparent);

--primary:        var(--color-blue-500);         /* #4B7BE5 — Credios blue */
--primary-hover:  var(--color-blue-600);         /* #3863CC */
--primary-soft:   var(--color-blue-50);          /* #EEF3FE — chip bg */
--primary-soft-hover: var(--color-blue-100);
--on-primary:     var(--color-ivory-elevated);   /* white em CTA */

--accent:         var(--color-gold-500);         /* #D4A351 — Credios gold */
--accent-hover:   var(--color-gold-600);
--accent-soft:    var(--color-gold-50);
--on-accent:      var(--color-charcoal-800);     /* charcoal em CTA gold */
```

**Regra do uso da cor**:
- 88% da UI é grayscale (ivory bg + charcoal fg + borders)
- 8% é **blue** (links, focus rings, ícones nav ativos, badge primary, status novo)
- 3% é **gold** (CTAs principais "Fechar lead", alertas SLA, badge "premium")
- 1% é status colors (kanban columns, badges de status)

> **Princípio Credios**: gold é caro. Usa parcimoniosamente — quando aparece, comunica importância (aprovação, fechamento, alerta). Replica o uso do site público.

### 3.2 Status colors (harmonizados com brand)

Cada status do pipeline tem cor própria, mas a paleta é **harmônica** com Credios — não saída de Material Design crua. Saturação alinhada com o gold/blue do brand pra parecer "do mesmo sistema".

```css
--status-novo:                #4B7BE5;   /* Credios blue — chegada */
--status-conversa:            #91B0F6;   /* blue-300 — começou */
--status-aguardando-resp:     #D4A351;   /* Credios gold — atenção do consultor */
--status-aguardando-doc:      #B8893A;   /* gold-600 — atenção do cliente */
--status-doc-enviada:         #6366F1;   /* indigo — em análise */
--status-em-negociacao:       #8B5CF6;   /* violet — negociando */
--status-fechado:             #10B981;   /* emerald — sucesso */
--status-perdido:             #F43F5E;   /* rose — perda */
--status-sem-resposta:        #6E7891;   /* charcoal-300 — silêncio */
--status-desqualificado:      #DC2626;   /* red-600 — barra alta */
```

**Tripleta por status** (bg + border + text):

```css
/* Exemplo: novo */
.status-novo-bg:     color-mix(in oklch, var(--status-novo) 12%, var(--bg-elevated));
.status-novo-border: color-mix(in oklch, var(--status-novo) 30%, transparent);
.status-novo-text:   color-mix(in oklch, var(--status-novo) 92%, var(--color-charcoal-800));
```

Garantir contraste:
- Texto sobre `bg-base`: AAA (≥7:1) — charcoal-800 sobre ivory dá ~14:1
- Texto sobre `bg-muted`: AA (≥4.5:1)
- Texto em badge sobre `bg-soft`: AA mínimo
- Blue-500 sobre ivory: 4.6:1 ✓
- Gold-500 sobre ivory: 2.8 — ⚠️ não usar gold pra texto sobre ivory; só pra bg ou ícones grandes. Pra texto, usar gold-700 (#95702E, 5.4:1)

### 3.3 Tipografia (5 fontes Credios)

**Stack oficial do site Credios**, herdado integralmente:

```css
@theme {
  --font-sans:    "Plus Jakarta Sans", "Outfit", system-ui, sans-serif;
  --font-display: "Space Grotesk", "Plus Jakarta Sans", system-ui, sans-serif;
  --font-serif:   "Fraunces", Georgia, serif;
  --font-mono:    "Inter", "SF Mono", ui-monospace, monospace;
  --font-outfit:  "Outfit", "Plus Jakarta Sans", system-ui, sans-serif;
}
```

| Fonte | Uso | Peso(s) | Por quê |
|---|---|---|---|
| **Plus Jakarta Sans** | Body, UI, forms, tabelas, navegação | 400, 500, 600, 700 | Fonte primária do site Credios. Geometric humanista, ótima legibilidade em 13-16px, OpenType features pra `tabular-nums` (essencial pra valores R$). |
| **Space Grotesk** | Display, KPIs grandes, headings de página, números hero | 500, 600, 700 | Display do site Credios. Usa nas KPI cards (`R$ 2.4M` em valor pipeline) e títulos de seção do dashboard — confere personalidade sem custo de legibilidade. |
| **Fraunces** | Acentos editoriais raros — quotes, "vazio especial", onboarding | 400 italic, 500 | Serif do site Credios pra "humanizar" momentos. **Uso restrito**: empty state do kanban ("Nenhum lead aqui... ainda."), tela de boas-vindas no primeiro login, citações em audit log de ações importantes. NÃO usar em UI funcional. |
| **Inter** | Mono — valores monetários, CPF, GCLID, IDs em audit log, timestamps técnicos | 400, 500 | O site usa Inter como `--font-mono`. Embora Inter seja sans, o site decidiu usá-la pra slot mono — manter coerência. Tabular numerals via `font-feature-settings: 'tnum'`. |
| **Outfit** | Reserva alternativa — botões grandes ou momentos onde Plus Jakarta fica "muito séria" | 400, 500, 600 | Já carregada no site (`--font-outfit`). Disponível mas raramente usada — opção pra A/B em buttons CTA grandes se Plus Jakarta parecer formal demais. |

**Carregamento via next/font** (idêntico ao site):
```ts
import { Plus_Jakarta_Sans, Outfit, Space_Grotesk, Inter, Fraunces } from "next/font/google";

const jakarta  = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-plus-jakarta-sans", display: "swap" });
const outfit   = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const grotesk  = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const inter    = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", style: ["normal", "italic"] });
```

**Escalas tipográficas**:

| Token | Tamanho | Line-height | Letter-spacing | Família | Uso |
|---|---|---|---|---|---|
| `display-xl` | 56px / 3.5rem | 1.0 | -0.025em | Space Grotesk 700 | Hero raro (onboarding) |
| `display-lg` | 44px / 2.75rem | 1.05 | -0.02em | Space Grotesk 700 | KPI principal (R$ pipeline) |
| `display` | 36px / 2.25rem | 1.1 | -0.02em | Space Grotesk 600 | KPI secundários |
| `h1` | 28px / 1.75rem | 1.2 | -0.015em | Plus Jakarta 600 | Títulos de página |
| `h2` | 22px / 1.375rem | 1.25 | -0.01em | Plus Jakarta 600 | Seções principais |
| `h3` | 18px / 1.125rem | 1.3 | -0.005em | Plus Jakarta 600 | Cards, sub-seções |
| `body-lg` | 16px / 1rem | 1.55 | 0 | Plus Jakarta 400 | Texto longo (lead detail) |
| `body` | 14px / 0.875rem | 1.5 | 0 | Plus Jakarta 400/500 | Padrão UI |
| `body-sm` | 13px / 0.8125rem | 1.45 | 0 | Plus Jakarta 400 | Tabelas densas |
| `caption` | 12px / 0.75rem | 1.4 | 0.005em | Plus Jakarta 500 | Labels, metadata |
| `micro` | 11px / 0.6875rem | 1.4 | 0.04em uppercase | Plus Jakarta 600 | Tags, pills, section labels |
| `editorial` | 18-22px | 1.5 | -0.01em | Fraunces 400 italic | Empty states "humanos", quotes |
| `mono` | 13px / 0.8125rem | 1.45 | 0 | Inter (tnum) | R$ valores, CPF, IDs |

**Otimizações OpenType**:

```css
/* Em valores monetários e tabelas */
.font-mono, .tabular {
  font-feature-settings: "tnum" 1, "lnum" 1, "zero" 1;  /* tabular nums + slashed zero */
  font-variant-numeric: tabular-nums slashed-zero;
}

/* Plus Jakarta features */
body {
  font-feature-settings: "ss01" 1, "ss02" 1, "cv11" 1;  /* alternate forms refinadas */
}
```

### 3.4 Espaçamento e densidade

**Scale 4-based** (Tailwind default mas com nomes semânticos):

```
0.5 = 2px   (hairline gap)
1   = 4px   (icon-text gap)
1.5 = 6px
2   = 8px   (button padding tight)
3   = 12px  (compact row)
4   = 16px  (default)
5   = 20px
6   = 24px  (section gap)
8   = 32px  (card padding generoso)
10  = 40px
12  = 48px  (page section gap)
16  = 64px  (hero spacing)
```

**Densidade — 3 modos** (toggle nas configurações de perfil, salvo em `users.densidade`):

| Modo | Row height | Padding card | Font body | Quem |
|---|---|---|---|---|
| **Compact** | 32px | p-3 | 13px | Power users (Gabriel) |
| **Comfortable** (default) | 40px | p-4 | 14px | Padrão |
| **Spacious** | 48px | p-5 | 15px | Novos users, mobile |

Implementação: CSS variable `--density-row-height` + class no `<html>`. Componentes leem var.

### 3.5 Borders, radii, sombras

**Border radius**: tudo em múltiplos consistentes — Credios site usa cantos médios, evitar over-rounded
```
--radius-sm: 6px    (chips, small buttons)
--radius:    10px   (cards padrão, inputs)
--radius-lg: 14px   (cards grandes)
--radius-xl: 18px   (modais, dialogs)
--radius-2xl: 24px  (heroes)
```

**Borders** — hairline obsessão (Apple-style), tingidas com charcoal:
```css
--border-hairline: 1px solid color-mix(in oklch, var(--color-charcoal-800) 8%, transparent);
--border-soft:     1px solid color-mix(in oklch, var(--color-charcoal-800) 12%, transparent);
--border-strong:   1px solid color-mix(in oklch, var(--color-charcoal-800) 18%, transparent);
--border-accent:   1px solid color-mix(in oklch, var(--color-gold-500) 35%, transparent);
```

> **Por que `color-mix`**: borders adaptam à cor do bg automaticamente (em dark mode usam fg-base que é claro, contra bg escuro = borda visível mas suave). Funciona out-of-the-box light/dark.

**Sombras em camadas** (várias pequenas pra textura, com tinge sutil de charcoal):

```css
--shadow-xs: 
  0 1px 0 0 color-mix(in oklch, var(--color-charcoal-800) 4%, transparent);
  
--shadow-sm:
  0 1px 2px -1px color-mix(in oklch, var(--color-charcoal-800) 10%, transparent),
  0 1px 0 0 color-mix(in oklch, var(--color-charcoal-800) 3%, transparent);

--shadow-md:
  0 4px 8px -2px color-mix(in oklch, var(--color-charcoal-800) 12%, transparent),
  0 2px 4px -2px color-mix(in oklch, var(--color-charcoal-800) 6%, transparent),
  0 0 0 1px color-mix(in oklch, var(--color-charcoal-800) 4%, transparent);

--shadow-lg:
  0 10px 24px -6px color-mix(in oklch, var(--color-charcoal-800) 18%, transparent),
  0 4px 10px -4px color-mix(in oklch, var(--color-charcoal-800) 10%, transparent),
  0 0 0 1px color-mix(in oklch, var(--color-charcoal-800) 5%, transparent);

--shadow-popover:  /* pra dropdowns / modais elevados */
  0 16px 40px -8px color-mix(in oklch, var(--color-charcoal-800) 24%, transparent),
  0 8px 16px -6px color-mix(in oklch, var(--color-charcoal-800) 16%, transparent),
  0 0 0 1px color-mix(in oklch, var(--color-charcoal-800) 8%, transparent);

--shadow-gold:  /* destaque pra elementos premium (CTA fechar lead) */
  0 4px 12px -4px color-mix(in oklch, var(--color-gold-500) 35%, transparent),
  0 2px 6px -2px color-mix(in oklch, var(--color-gold-500) 20%, transparent);
```

### 3.6 Materiais (glassmorphism estruturado)

**4 níveis** — cada um tem regra clara de quando usar.

#### Nível 1: **Solid** (default)
- Sem blur, bg sólida (`ivory-elevated`)
- **Quando**: cards de conteúdo principal (lead detail sections), tabelas, formulários
- **Por quê**: máxima legibilidade, sem custo de perf

```css
.surface-solid {
  background: var(--bg-elevated);
  border: var(--border-hairline);
  box-shadow: var(--shadow-xs);
}
```

#### Nível 2: **Frosted** (glassmorphism leve)
- `backdrop-blur(12px)` + bg ivory semi-transparente
- **Quando**: header sticky, sidebar (sobre conteúdo do main), toast container
- **Por quê**: sente que "flutua" sobre conteúdo sem competir

```css
.surface-frosted {
  background: color-mix(in oklch, var(--color-ivory-elevated) 72%, transparent);
  backdrop-filter: blur(12px) saturate(1.4);
  border: var(--border-hairline);
  box-shadow: var(--shadow-sm);
}
```

#### Nível 3: **Vibrant** (glassmorphism mais intenso)
- `backdrop-blur(24px) saturate(1.8)` + bg ~55% opaco
- **Quando**: command palette, modais (DialogContent), notification dropdown
- **Por quê**: precisa contexto do que está atrás (palette deve sentir overlay, não modal) mas com clareza de leitura

```css
.surface-vibrant {
  background: color-mix(in oklch, var(--color-ivory-elevated) 55%, transparent);
  backdrop-filter: blur(24px) saturate(1.8);
  border: var(--border-soft);
  box-shadow: var(--shadow-popover);
}
```

#### Nível 4: **Ethereal** (último nível, raríssimo)
- Quase total transparência + blur intenso
- **Quando**: onboarding splash, primeiro-acesso (background fica visível com gradient blue→ivory)
- **Por quê**: é o "wow" reservado pra momentos cerimoniais

```css
.surface-ethereal {
  background: color-mix(in oklch, var(--color-ivory-elevated) 32%, transparent);
  backdrop-filter: blur(40px) saturate(1.6);
  border: var(--border-soft);
  box-shadow: var(--shadow-lg);
}
```

**Fallback obrigatório**: detectar `@supports (backdrop-filter: blur(1px))` — sem suporte (browsers antigos), cair pra `surface-solid` com `bg-elevated`. Não exibir gradientes "tristes" sem blur.

> **Onde NÃO usar glass** (decidido):
> - Tabelas (já têm muita informação, glass adiciona ruído)
> - Lead detail cards de seções (precisam contraste máximo pra editar)
> - Charts e KPIs (números precisam crispness)
> - Mobile em geral (custo de perf alto, valor estético baixo)

### 3.7 Movimento

**Curvas** (Tailwind 4 já tem, refinar):
```
--ease-out-soft:    cubic-bezier(0.16, 1, 0.3, 1);     /* spring-like */
--ease-out-snappy:  cubic-bezier(0.34, 1.56, 0.64, 1); /* slight overshoot */
--ease-in-out:      cubic-bezier(0.83, 0, 0.17, 1);    /* page transition */
--ease-spring:      cubic-bezier(0.5, 1.6, 0.4, 1);    /* button press */
```

**Durações**:
- `duration-instant`: 80ms (button hover)
- `duration-fast`: 160ms (toggle, dropdown abrir)
- `duration-base`: 240ms (modal enter, drawer)
- `duration-slow`: 400ms (page transition, kanban drag drop)
- `duration-deliberate`: 600ms (toast slide, route enter)

**Princípios**:
- **Origem física**: scale-in vem do ponto de origem (clique, ícone). Modal scale-in do center. Toast slide-in da borda.
- **Stagger**: lista de cards aparece com 30-50ms de delay entre eles. Limite de 8 itens (depois disso, fade-in todos junto pra não atrasar).
- **Drag**: card "lifta" 2-4px com sombra crescida quando começa drag. Volta com spring quando solta.
- **Skeleton → conteúdo**: fade não swap brusco.
- **`prefers-reduced-motion`**: cortar todas animações pra `duration-instant` ou eliminar.

**Lib aprovada**: **Motion (ex-Framer Motion)** pra drag-drop kanban (já temos via dnd-kit), route transitions, stagger orchestration. Importar a partir de Fase D7.

### 3.8 Iconografia

Continuar com **Lucide** (já usado, ~1500 ícones, consistente).

**Convenções**:
- Tamanho default: `size-4` (16px)
- Em buttons: `size-3.5` (14px) + `gap-1.5`
- Em headings: `size-5` (20px)
- Stroke width: `1.75` (default Lucide é 2 — mudar pra 1.75 dá feel mais refinado e combina com Plus Jakarta)

**Ícones de status** (alongside badge — opcional, mas dá +polish):
- novo: `Sparkles`
- conversa_inicial: `MessageCircle`
- aguardando_*: `Clock`
- doc_enviada: `FileCheck`
- em_negociacao: `Handshake`
- fechado: `CircleCheck` (cor emerald)
- perdido: `CircleX` (cor rose)
- sem_resposta: `EyeOff`
- desqualificado: `Ban` (cor red-600)

### 3.9 Ilustrações pra empty states ✅

**Decidido**: 6 SVGs custom monoline + accent (cores Credios — blue-500 e gold-500) + texto + CTA.

**Cobre**: lista vazia, kanban vazio, sem alertas SLA, sem templates, sem audit, sem regras.

**Estilo**: monoline 1.5px stroke usando charcoal-300 como base + spot accents em blue-500 e gold-500. Fundo transparente. ViewBox quadrado 200×200.

---

## 4. Aplicação por componente

### 4.1 App shell

#### Sidebar (desktop)
- **Material**: `surface-frosted` (blur sobre o main content quando há scroll)
- **Largura**: 240px (atual 256px, reduzir levemente)
- **Top**: logo Credios (palavra "Credios" em Space Grotesk 600 + tagline "CRM" em micro caption gold-700) + sino de notificações inline (não no header)
- **Sections**: agrupadas com `caption micro uppercase fg-subtle` ("Trabalho", "Administração", "Pessoal")
- **Items**: 36px height (32 em compact), `radius-sm`, hover `bg-charcoal-800/4`, active `bg-blue-50 + text-blue-700` (em dark: `bg-blue-900/40 + text-blue-200`)
- **Sub-items** (opcional Fase D2+): nested ao clicar item com filhos (Configurações expande pra Roteamento, Mensagens, Usuários)
- **Bottom**: avatar + perfil + dropdown (substitui o user-menu do header — Linear-style)
- **Collapsible**: ícone collapse no top reduz pra 64px (só ícones), preferência salva

#### Header
- **Material**: `surface-frosted`, sticky, height 56px
- **Mobile**: hambúrguer + título da página + avatar
- **Desktop**: command palette **inline** ("Buscar... `⌘K`") ocupando centro 480px max — sempre visível, click abre palette. Notion-style.
- **Direita**: ações contextuais da página (ex: "+ Novo lead" no /leads — botão variant `accent` gold), depois sino, depois user-menu
- **Breadcrumb opcional** (desktop): pra rotas profundas (`/configuracoes/usuarios` → "Configurações / Usuários")

### 4.2 Cards e surfaces

**3 variantes**:
- `card` — solid, default, pra conteúdo (`surface-solid`)
- `card-floating` — frosted, pra elementos sobrepostos (sino dropdown, popover)
- `card-feature` — solid + accent border esquerda 3px gold (KPI destaque, alerta importante, "lead premium")

**Header de card**: `p-4 border-b border-hairline` com title `h3` + ações inline à direita. Body `p-4`. Footer opcional `border-t`.

### 4.3 Buttons

Refinar variantes existentes. **Variante nova `accent` (gold)** pra CTAs premium.

| Variante | Bg | Border | Texto | Hover | Quando |
|---|---|---|---|---|---|
| `default` | `--primary` (blue-500) | none | white | bg blue-600, scale 0.98 ao press | CTA primário (Salvar, Confirmar) |
| `accent` | `--accent` (gold-500) | none | charcoal-800 | bg gold-600 | CTAs premium ("Marcar fechado", "Aprovar") |
| `secondary` | `--bg-muted` | hairline | `--fg-base` | `bg-charcoal-800/6` | Ações secundárias |
| `outline` | transparente | strong | `--fg-base` | `bg-charcoal-800/4` | Cancelar, links |
| `ghost` | transparente | none | `--fg-base` | `bg-charcoal-800/6` | Toolbar actions |
| `destructive` | `--danger` (red-600) | none | white | darken 10% | Excluir, desativar |

**Sizes** (refinar — atual usa h fixos):
- `xs`: h-7 (28px), text-xs, px-2.5
- `sm`: h-8 (32px), text-sm, px-3
- `default`: h-9 (36px), text-sm, px-3.5
- `lg`: h-10 (40px), text-base, px-4
- `icon`: square sizes (24/28/32/36/40)

**Press feedback**: scale 0.98 + 30ms (já temos `active:not-aria-[haspopup]:translate-y-px` — refinar).

**Loading**: spinner integrado, button mantém largura (medir antes), texto vira invisível mas mantém espaço — não pula.

### 4.4 Forms

**Inputs**:
- Height 36px (32 em compact)
- Border hairline → focus border blue-500 + ring 3px blue-500/30
- Padding 12px horizontal
- Background: ivory-elevated (#FFFFFF) sobre ivory-base
- Labels acima (não floating — floating quebra acessibilidade em screen readers)
- Caption error logo abaixo, `--danger` (red-600) + ícone `AlertCircle`

**Textareas**: igual mas height auto, min 80px

**Select**: já temos via shadcn, refinar trigger pra mesma altura/border dos inputs

**Validation**: inline em onBlur, não em onChange (não interrompe digitação). Submit valida tudo.

**Help text**: caption muted abaixo do label, antes do input

### 4.5 Tables e listas

- **Header**: sticky, `bg-ivory-subtle` (#E8E4D9), `caption micro uppercase fg-subtle`, hairline bottom
- **Row height**: 40px comfortable / 32 compact
- **Hover row**: `bg-charcoal-800/3` + cursor pointer + accent border-l 2px (sutil, blue-500)
- **Zebra**: ❌ (cria ruído desnecessário)
- **Click**: linha inteira é clicável (vai pro detalhe), botões interno usam `e.stopPropagation()`
- **Inline actions**: aparecem on-hover na última coluna (ícones)
- **Selection**: checkbox no início, header com select-all + indicator
- **Empty**: ilustração centralizada + texto Fraunces italic + CTA
- **Loading**: skeleton rows (3-5 placeholders pulse com tinge ivory-muted)
- **Sticky first column** (mobile): nome do lead fica fixo, scroll horizontal das outras

**Density toggle**: ícone no canto superior direito (compact ↔ comfortable ↔ spacious)

**Column visibility**: dropdown com checkboxes (Linear-style)

### 4.6 Kanban (a estrela do redesign) ✅

- **Material**: cards `surface-solid` em coluna `surface-frosted` — coluna "flutua" sobre o main, cards são "sólidos por cima"
- **Coluna header**: top sticky, `surface-frosted`, status icon + label Plus Jakarta 600 + count + somatório R$ em **Inter mono tabular**
- **Border-l accent** na coluna inteira (3px) com cor do status
- **Card**:
  - `radius-md` (10px), hairline border, `surface-solid`
  - Avatar do consultor canto superior direito (32px)
  - Nome do lead h3 Plus Jakarta 600 (truncado 2 linhas)
  - Valor em **Inter mono tabular** `display-sm` (destaque)
  - Linha de chips: origem (chip soft com cor da origem) + UF (chip outline) — micro caption
  - Footer: último contato relativo + indicadores (esfriando = ícone snowflake gold-600, SLA = badge red-600) à direita
- **Drag**:
  - Lift: scale 1.02 + shadow-lg + rotate -1deg (Notion-style tilt)
  - Drop zone: dashed border 2px breathing animation (opacity 0.5 ↔ 0.8 a cada 800ms) na cor do status destino
  - Drop: spring back to grid position (300ms)
- **Add lead inline** (botão "+ Novo" gold variant no fundo da coluna "novo")

### 4.7 Lead detail (rethink completo) ✅

Layout atual: 3 cards stacked à esquerda + timeline à direita. Aprovado pra rethink completo.

**Proposta**:
- **Hero header** (full-width 120px): gradient sutil do status do lead (ex: `from-blue-500/15 to-transparent` pra novo, `from-emerald-500/15 to-transparent` pra fechado) + nome em **Space Grotesk display**, badge status grande, valor em **Inter mono tabular display**, CTAs principais
- **Sticky action bar** abaixo do hero: WhatsApp (verde-WhatsApp), Copiar email, Marcar último contato, Mudar status, Reatribuir — sempre visível ao scrollar
- **Tabs em vez de cards stacked**:
  - "Visão geral" (Pessoais + Contato + Operação inline editável)
  - "Origem & Tracking" (read-only cards atuais)
  - "Documentos" (placeholder pra Fase futura)
  - "Atividade" (timeline + sugestões de mensagem)
- **Inline edit por field** (não por seção):
  - Hover field reveals pencil ícone à direita (charcoal-300)
  - Click pencil → field vira input com Save/Cancel inline (ou Esc/Enter)
  - Mantém densidade — não toggle de form gigante
- **Timeline**:
  - Vertical com **conector visual** (linha vertical fina charcoal-200 conectando ícones de eventos)
  - Avatares maiores (28px) com ring por tipo
  - Eventos de sistema com cinza esmaecido + ícone fino — não compete com manuais
  - Input no topo: chip de tipo + textarea expansível + botão "Registrar" (Cmd+Enter envia)
  - Agrupamento por dia (label "Hoje", "Ontem", "12 de mar" em micro uppercase gold-700)
- **Mensagens sugeridas**: chips horizontais com nome do template — click expande mostrando preview + Copiar (em vez de cards grandes)

### 4.8 Reports / KPIs / charts

#### KPI cards (refinar)
- **Layout**: número em **Space Grotesk display-lg** + `caption micro` label uppercase + sparkline (mini chart linha 60×24px, blue-500) + delta vs período anterior (chip ↑12% emerald / ↓5% rose)
- **Background sutil**: gradient radial muito leve (`blue-500/3` → transparente) na esquina; pra KPI premium, gradient gold (`gold-500/4`)
- **Hover**: scale 1.01 + shadow-md (subtle interactive)

#### Charts (Recharts retheming)
- **Cores**: usar status colors definidos (já consistente com badges) + brand blue/gold pra séries principais
- **Curvas**: `monotone` em vez de `linear` em todos line/area charts (mais suave)
- **Gradient fills** em area charts: opacity 0.6 → 0.05 (não flat 0.5)
- **Grid**: dashed `border-subtle`, vertical-only (cleaner)
- **Tooltip**: `surface-vibrant` (glassmorphism) com border sutil + sombra popover, label em Plus Jakarta 600, valor em Inter mono
- **Eixos**: ticks `caption muted`, sem axis line
- **Bar charts**: rounded top corners (radius 4px), bars principais em blue-500
- **Pie/donut**: padding angle 2px, inner radius 65%, paleta status consistente

#### Tabela "Performance por consultor"
- Avatar + nome (Plus Jakarta 600) + (perfil chip)
- Métricas em colunas com mini-progress bars (taxa fechamento como % bar gold-500)

### 4.9 Modais e dialogs

- **Backdrop**: `bg-charcoal-800/40 + backdrop-blur(8px)` (não 100% opaco)
- **Content**: `surface-vibrant`, `radius-xl`, max-width 540px (small) / 720px (medium) / 960px (large)
- **Animação enter**: scale 0.96 → 1, fade 0 → 1, 240ms ease-out-snappy (slight overshoot)
- **Header**: title `h2` Plus Jakarta 600 + close `X` canto direito (32x32 ghost button)
- **Footer**: actions à direita, primary à direita, secondary à esquerda
- **Esc fecha** (já existe via base-ui)
- **Focus trap** (já via base-ui)

### 4.10 Command palette (já existe, retheme)

- **Material**: `surface-vibrant` mais intenso
- **Posição**: top-center, 32% from top (atual está OK, manter)
- **Width**: 640px max
- **Input**: h-12, ícone Search à esquerda (charcoal-400), kbd `Esc` à direita, font Plus Jakarta 500
- **Categorias**: "Leads", "Ações rápidas", "Navegação" (no futuro: Cmd+K vai além de leads)
- **Item**: ícone à esquerda (status icon na cor do status), label Plus Jakarta 500, secondary text muted à direita Inter mono se for valor/ID, `kbd` shortcuts charcoal-700 sobre ivory-muted
- **Recent items** (Fase D3+): salvar últimos 5 selecionados em localStorage
- **Empty state**: "Digite ao menos 2 caracteres" Fraunces italic com ícone Search large + tip about kbd shortcuts

### 4.11 Notifications bell (sino)

- **Trigger**: ícone Bell, badge animado (subtle bounce 600ms quando count aumenta) — badge com bg gold-500 + text charcoal
- **Dropdown**: `surface-vibrant`, max-width 380px, max-height 480px scroll
- **Item**:
  - Avatar/ícone do tipo de alerta à esquerda
  - Título Plus Jakarta 600 + descrição Plus Jakarta 400 muted
  - Tempo relativo Inter mono caption
  - Hover: bg-charcoal-800/4, click vai pro recurso
  - "Mark as read" inline X botão à direita on-hover
- **Footer**: "Ver todos" link → /audit ou /sla
- **Empty**: "Tudo em dia ✓" Fraunces italic com checkmark animado emerald

### 4.12 Toasts (Sonner)

- **Material**: `surface-vibrant` sobre tudo
- **Position**: bottom-right desktop, top mobile
- **Width**: 380px desktop, full-width-12 mobile
- **Variantes**: success (border-l 3px emerald), error (border-l red-600), warning (border-l gold-500), info (border-l blue-500)
- **Duration**: 4s default, 6s pra error, manual close se hover
- **Icon**: filled circle 20px à esquerda (na cor da variante)
- **Action button** opcional à direita ("Desfazer", "Ver")

### 4.13 Empty states (template) ✅

```
┌─────────────────────────────────┐
│       [SVG ilustração]          │
│         (~140×100px)            │
│   monoline charcoal-300 +       │
│   accents blue-500 + gold-500   │
│                                 │
│      Heading Plus Jakarta 600   │
│   Texto Fraunces italic 1 linha │
│                                 │
│       [CTA primary] [link]      │
└─────────────────────────────────┘
```

**Ilustrações** (6 SVGs custom):
- `EmptyLeads` — funil estilizado com leads "caindo" (gold spot)
- `EmptyKanban` — colunas com cards fantasmas (blue spot)
- `EmptyAlerts` — sino com checkmark (emerald spot)
- `EmptyTemplates` — folha em branco com pena (gold spot)
- `EmptyAudit` — relógio + ✓ (charcoal monochrome)
- `EmptyRules` — engrenagens conectadas (blue spot)

Estilo: monoline 1.5px stroke charcoal-300, spots em blue-500 e gold-500, fundo transparente, viewBox quadrado 200×200.

---

## 5. Densidade e personalização ✅

**Adicionar coluna `densidade` em `users`**: enum `compact | comfortable | spacious`, default `comfortable`.

**Adicionar página /perfil → Aparência** com:
- Densidade (3 radios)
- Theme (auto/light/dark)
- Reduce motion (toggle, default segue sistema)
- Toggle "compactar números grandes" (R$ 350K vs R$ 350.000)

**Implementação**: server reads, sets class no `<html>`. CSS variables ajustam.

---

## 6. Dark mode (paridade desde D1)

Hoje o `--background` em dark já existe via shadcn `base-nova` mas é genérico. Refinar com **charcoal scale Credios**:

```css
/* Dark mode — base charcoal + ivory text */
:root.dark {
  --bg-base:        var(--color-charcoal-900);     /* #0E1623 */
  --bg-elevated:    var(--color-charcoal-800);     /* #141E30 — Credios charcoal */
  --bg-muted:       var(--color-charcoal-700);     /* #1B2438 */
  --bg-subtle:      var(--color-charcoal-600);     /* #252D43 */

  --fg-base:        var(--color-ivory-base);       /* #F8F6F0 — Credios ivory */
  --fg-muted:       var(--color-charcoal-200);     /* #9BA3B4 */
  --fg-subtle:      var(--color-charcoal-300);     /* #6E7891 */
  --fg-faint:       var(--color-charcoal-400);     /* #4D5670 */

  --border-subtle:  color-mix(in oklch, var(--color-ivory-base) 8%, transparent);
  --border-base:    color-mix(in oklch, var(--color-ivory-base) 12%, transparent);
  --border-strong:  color-mix(in oklch, var(--color-ivory-base) 18%, transparent);

  --primary:        var(--color-blue-400);         /* #6E94EE — mais saturado em dark */
  --primary-hover:  var(--color-blue-300);
  --primary-soft:   color-mix(in oklch, var(--color-blue-500) 18%, var(--bg-elevated));
  --on-primary:     var(--color-charcoal-900);

  --accent:         var(--color-gold-400);         /* #D9B05F */
  --accent-hover:   var(--color-gold-300);
  --accent-soft:    color-mix(in oklch, var(--color-gold-500) 18%, var(--bg-elevated));
  --on-accent:      var(--color-charcoal-900);
}
```

**Status colors em dark**: bg fica `color-mix(status 25%, charcoal-800)`, text `color-mix(status 80%, ivory-base)` — preserva identidade do status mas com contraste correto sobre charcoal.

**Glassmorphism em dark**: blur fica mais "fumê" sobre o gradient charcoal — fica perfeito pra notificação e palette.

**Toggle**: respeitar `prefers-color-scheme` por default + override manual em /perfil → Aparência (salva em cookie + DB).

---

## 7. Responsivo — repensar mobile, não só "responsive" ✅

Hoje é "desktop com sidebar colapsa". Aprovado pra rethink real.

### Mobile (<768px)

- **Bottom nav** (5 ícones primários): Leads, Kanban, Sino, Buscar (Cmd+K equivalente), Perfil
- **Sidebar full-screen** ao tocar hambúrguer (slide-in da esquerda, ocupa 88% da tela)
- **Lead list**: cards verticais (não tabela horizontal scroll), 1 por viewport row
- **Kanban**: scroll horizontal preservado, snap nas colunas
- **Lead detail**: tabs viram dropdown ou tabs scroll horizontal
- **Modais**: bottom sheets (deslize de baixo) em vez de center modals
- **Toast**: top, full-width-12

### Tablet (768-1024px)

- Sidebar collapsed-by-default (só ícones), expand on hover
- Lead list: tabela tradicional mas com colunas selecionáveis (skip menos importantes)

### Desktop (>1024px)

- Layout completo
- Cmd+K palette inline no header
- Multi-column em /relatorios

---

## 8. Acessibilidade

- **Contraste**: AAA texto principal (charcoal-800 sobre ivory = ~14:1), AA mínimo em badges/chips
- **Focus visible**: ring 2px blue-500 + offset 2px em TODOS interativos
- **Keyboard**: Tab order lógico, Esc fecha modais/palettes, Enter submit forms
- **ARIA**: labels em icon buttons, `role="status"` em toasts, `aria-live` em badges de count
- **Screen reader**: nomes claros (não "icon-1"), section landmarks (`<main>`, `<nav>`, `<aside>`)
- **Reduce motion**: corta transitions pra <100ms ou elimina
- **Zoom**: layout não quebra até 200% zoom
- **Color-blind**: status nunca é só cor — sempre tem ícone ou label associado
- **Gold caveat**: gold-500 sobre ivory tem contraste 2.8 — pra texto pequeno usar gold-700 (#95702E, 5.4:1) ou wrap em badge com bg-gold-50

---

## 9. Performance e perceived speed

- **Skeleton loaders**: tabela, kanban, detail (em vez de "Carregando...")
- **Optimistic UI**: clique → estado muda no front instantâneo, API confirma depois
- **Lazy load**: charts só renderizam quando visíveis (IntersectionObserver)
- **Image optimization**: avatars usam Next/Image com placeholder blur
- **Glassmorphism custo**: medir em devices mais fracos (Macbook Air M1, iPhone 11). Se cair abaixo de 60fps, reduzir blur.
- **Bundle**: code-split por rota (Next App Router já faz). Recharts é grande — lazy load só em /relatorios
- **Fonts**: `font-display: swap` + preload variable font (Plus Jakarta Sans em particular — body fonte). Fraunces e Outfit `display: swap` sem preload (uso raro).
- **Realtime debounce**: já fazemos 400ms — manter
- **Critical fonts**: Plus Jakarta + Space Grotesk em preload (`<link rel="preload" as="font" type="font/woff2" crossorigin>` via next/font)

---

## 10. Implementação em fases (estimativa)

| Fase | Escopo | Esforço aprox. |
|---|---|---|
| **D1 — Tokens e fundamentos** | CSS variables Credios (4 brand cores + escalas + semânticos), Tailwind 4 `@theme`, integração 5 fontes via next/font, tema dark com charcoal scale, fonte tabular | 5-7h |
| **D2 — Surfaces e átomos** | Refactor Button (variante `accent` gold), Input, Card, Badge, Avatar, Toast (Sonner), Dialog (todos os 4 níveis de material) | 6-8h |
| **D3 — App shell** | Sidebar redesign (frosted, colapsável, user no bottom, logo Credios em Space Grotesk), Header (palette inline, sticky frosted), CommandPalette (vibrant, categorias) | 4-6h |
| **D4 — Lead views** | LeadList (density toggle, hover, sticky col mobile), LeadKanban (cards refinados Plus Jakarta + Inter mono, drag tilt, drop zones), LeadDetail (hero gradient, tabs, inline edit, timeline com connector) | 10-14h |
| **D5 — Reports retheming** | KPIs com Space Grotesk display + sparkline blue + delta, Recharts retheme (brand colors, gradients, monotone, tooltip glass), tabela perf com mini-bars gold | 4-6h |
| **D6 — Empty states + ilustrações** | 6 SVGs custom monoline charcoal+blue+gold, integração nos 6 lugares, headings Plus Jakarta + textos Fraunces italic | 4-6h |
| **D7 — Motion polish** | Setup Motion lib, stagger em listas, spring presses, drag tilts, route transitions | 3-5h |
| **D8 — Mobile rethink** | Bottom nav, lead cards mobile, bottom sheets, sidebar drawer full-screen | 6-8h |
| **D9 — A11y audit + density modes** | Adicionar coluna `densidade` em `users`, /perfil aparência, Lighthouse a11y pass, contrast audit (especialmente gold) | 3-5h |
| **D10 — QA cross-browser + perf** | Testar Safari/Chrome/Firefox, Lighthouse perf, ajustes finais, perf audit em Macbook Air M1 | 2-4h |

**Total estimado**: ~50-70h spread em ~3 semanas com sessões focadas.

---

## 11. Tokens preview (Tailwind 4 config + globals.css)

Esqueleto inicial pra Fase D1 (NÃO IMPLEMENTAR AINDA, só prévia):

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  /* === Credios Brand (4 cores oficiais) === */
  --color-credios-blue:     #4B7BE5;
  --color-credios-gold:     #D4A351;
  --color-credios-ivory:    #F8F6F0;
  --color-credios-charcoal: #141E30;

  /* === Blue scale === */
  --color-blue-50:  #EEF3FE;
  --color-blue-100: #DCE6FD;
  --color-blue-200: #BCCFFB;
  --color-blue-300: #91B0F6;
  --color-blue-400: #6E94EE;
  --color-blue-500: #4B7BE5;
  --color-blue-600: #3863CC;
  --color-blue-700: #2C4FA8;
  --color-blue-800: #213D80;
  --color-blue-900: #182C5C;
  --color-blue-950: #0F1B3D;

  /* === Gold scale === */
  --color-gold-50:  #FBF6EB;
  --color-gold-100: #F6EBD1;
  --color-gold-200: #ECD7A2;
  --color-gold-300: #E1BE73;
  --color-gold-400: #D9B05F;
  --color-gold-500: #D4A351;
  --color-gold-600: #B8893A;
  --color-gold-700: #95702E;
  --color-gold-800: #735524;
  --color-gold-900: #4F3A15;
  --color-gold-950: #2D2008;

  /* === Charcoal scale === */
  --color-charcoal-50:  #E8EAEF;
  --color-charcoal-100: #C9CDD8;
  --color-charcoal-200: #9BA3B4;
  --color-charcoal-300: #6E7891;
  --color-charcoal-400: #4D5670;
  --color-charcoal-500: #353D55;
  --color-charcoal-600: #252D43;
  --color-charcoal-700: #1B2438;
  --color-charcoal-800: #141E30;
  --color-charcoal-900: #0E1623;
  --color-charcoal-950: #060A14;

  /* === Ivory scale === */
  --color-ivory-base:     #F8F6F0;
  --color-ivory-elevated: #FFFFFF;
  --color-ivory-muted:    #F0EDE5;
  --color-ivory-subtle:   #E8E4D9;

  /* === Fonts (5 fontes Credios) === */
  --font-sans:    "Plus Jakarta Sans", "Outfit", system-ui, sans-serif;
  --font-display: "Space Grotesk", "Plus Jakarta Sans", system-ui, sans-serif;
  --font-serif:   "Fraunces", Georgia, serif;
  --font-mono:    "Inter", "SF Mono", ui-monospace, monospace;
  --font-outfit:  "Outfit", "Plus Jakarta Sans", system-ui, sans-serif;

  /* === Radii === */
  --radius-sm:  0.375rem;   /* 6px */
  --radius:     0.625rem;   /* 10px */
  --radius-lg:  0.875rem;   /* 14px */
  --radius-xl:  1.125rem;   /* 18px */
  --radius-2xl: 1.5rem;     /* 24px */

  /* === Motion === */
  --duration-instant:    80ms;
  --duration-fast:       160ms;
  --duration-base:       240ms;
  --duration-slow:       400ms;
  --duration-deliberate: 600ms;

  --ease-out-soft:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-snappy:  cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-spring:      cubic-bezier(0.5, 1.6, 0.4, 1);
}

/* === Tokens semânticos === */
:root {
  /* Light */
  --bg-base:     var(--color-ivory-base);
  --bg-elevated: var(--color-ivory-elevated);
  --bg-muted:    var(--color-ivory-muted);
  --bg-subtle:   var(--color-ivory-subtle);

  --fg-base:     var(--color-charcoal-800);
  --fg-muted:    var(--color-charcoal-500);
  --fg-subtle:   var(--color-charcoal-300);
  --fg-faint:    var(--color-charcoal-200);

  --primary:        var(--color-blue-500);
  --primary-hover:  var(--color-blue-600);
  --primary-soft:   var(--color-blue-50);
  --on-primary:     var(--color-ivory-elevated);

  --accent:         var(--color-gold-500);
  --accent-hover:   var(--color-gold-600);
  --accent-soft:    var(--color-gold-50);
  --on-accent:      var(--color-charcoal-800);

  --success: #10B981;
  --warning: var(--color-gold-500);
  --danger:  #DC2626;
  --info:    var(--color-blue-500);
}

:root.dark {
  --bg-base:     var(--color-charcoal-900);
  --bg-elevated: var(--color-charcoal-800);
  --bg-muted:    var(--color-charcoal-700);
  --bg-subtle:   var(--color-charcoal-600);

  --fg-base:     var(--color-ivory-base);
  --fg-muted:    var(--color-charcoal-200);
  --fg-subtle:   var(--color-charcoal-300);
  --fg-faint:    var(--color-charcoal-400);

  --primary:        var(--color-blue-400);
  --primary-hover:  var(--color-blue-300);
  --primary-soft:   color-mix(in oklch, var(--color-blue-500) 18%, var(--bg-elevated));
  --on-primary:     var(--color-charcoal-900);

  --accent:         var(--color-gold-400);
  --accent-hover:   var(--color-gold-300);
  --accent-soft:    color-mix(in oklch, var(--color-gold-500) 18%, var(--bg-elevated));
  --on-accent:      var(--color-charcoal-900);
}

body {
  background: var(--bg-base);
  color: var(--fg-base);
  font-family: var(--font-sans);
  font-feature-settings: "ss01" 1, "cv11" 1;
}

::selection {
  background: color-mix(in oklch, var(--color-gold-500) 30%, transparent);
  color: var(--color-charcoal-800);
}

/* === Materiais === */
.surface-solid {
  background: var(--bg-elevated);
  border: 1px solid color-mix(in oklch, var(--color-charcoal-800) 8%, transparent);
}

.surface-frosted {
  background: color-mix(in oklch, var(--color-ivory-elevated) 72%, transparent);
  backdrop-filter: blur(12px) saturate(1.4);
  border: 1px solid color-mix(in oklch, var(--color-charcoal-800) 8%, transparent);
}

.surface-vibrant {
  background: color-mix(in oklch, var(--color-ivory-elevated) 55%, transparent);
  backdrop-filter: blur(24px) saturate(1.8);
  border: 1px solid color-mix(in oklch, var(--color-charcoal-800) 12%, transparent);
}

.surface-ethereal {
  background: color-mix(in oklch, var(--color-ivory-elevated) 32%, transparent);
  backdrop-filter: blur(40px) saturate(1.6);
  border: 1px solid color-mix(in oklch, var(--color-charcoal-800) 8%, transparent);
}

/* Dark adapta materiais — usa charcoal-800 como base */
:root.dark .surface-frosted {
  background: color-mix(in oklch, var(--color-charcoal-800) 72%, transparent);
}
:root.dark .surface-vibrant {
  background: color-mix(in oklch, var(--color-charcoal-800) 55%, transparent);
}
:root.dark .surface-ethereal {
  background: color-mix(in oklch, var(--color-charcoal-800) 32%, transparent);
}

@supports not (backdrop-filter: blur(1px)) {
  .surface-frosted, .surface-vibrant, .surface-ethereal {
    background: var(--bg-elevated);
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Tabular numerals em valores monetários */
.font-mono, [data-tabular] {
  font-feature-settings: "tnum" 1, "lnum" 1, "zero" 1;
  font-variant-numeric: tabular-nums slashed-zero;
}
```

```ts
// src/app/layout.tsx (preview — Fase D1)
import { Plus_Jakarta_Sans, Outfit, Space_Grotesk, Inter, Fraunces } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
  preload: true,
});
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: true,
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-outfit",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${jakarta.variable} ${grotesk.variable} ${inter.variable} ${outfit.variable} ${fraunces.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

---

## 12. Riscos e trade-offs

| Risco | Mitigação |
|---|---|
| **Glassmorphism ruim em devices fracos** | Limitar uso a 4 surfaces específicas; fallback solid; medir FPS em Macbook Air M1 antes de shipar |
| **Densidade compact ilegível** | Default = comfortable; compact é opt-in via /perfil → Aparência |
| **Gold sobre ivory baixo contraste pra texto** | Documentado: gold só pra bg, ícones grandes, ou variante gold-700 (#95702E) pra texto pequeno. Audit visual em D2 |
| **Brand color dessincronizar com site** | CSS vars com nomes Credios oficiais (`--color-credios-*`). Se site mudar, atualizar 4 vars resolve |
| **Ilustrações custom atrasam ship** | Empty states com texto + accent border até ilustrações chegarem; pode shipar em 2 etapas (D5 sem, D6 com) |
| **shadcn `base-nova` não acompanha** | Já vimos que tem bugs (CommandDialog faltando wrapper). Se redesign exigir overrides demais, considerar fork dos componentes pra `src/components/ui` próprios — perdemos auto-update mas ganhamos controle |
| **Inline edit por field complexo** | Manter edit por seção como fallback; rolling out por seção ao longo de D4 (Pessoais primeiro, validar UX, depois outras) |
| **Mobile rethink atrasa muito** | Pode ficar pra fase D8 separada — desktop redesign fecha primeiro, mobile vem depois sem bloquear ship |
| **Dark mode não testado em prod** | Fazer toggle aparecer em /perfil cedo (D1), QA contínuo |
| **5 fontes = bundle pesado** | next/font + `display: swap` + subset latin. Plus Jakarta + Space Grotesk preload (críticas), Fraunces/Outfit lazy. Estimativa total: ~140KB (aceitável pra produto que carrega 1x e dura sessão de 6h) |
| **Fraunces usado demais perde charme** | Documentar: serif só em empty states, primeiro acesso, audit log notes especiais. Code review checa abuso |

---

## 13. Decisões aprovadas ✅

Todas as decisões foram confirmadas pelo owner. Locked-in:

1. **Brand color** — ✅ **Credios oficial** (blue #4B7BE5 + gold #D4A351 + ivory #F8F6F0 + charcoal #141E30), 100% aderente ao site `credios-website-v2`. Sem opções alternativas.
2. **Glassmorphism scope** — ✅ **4 níveis** (solid → frosted → vibrant → ethereal). NÃO usar em tabelas, charts, cards de lead detail, mobile geral.
3. **Lead detail rethink** — ✅ **Tabs + hero + inline edit por field**. Hero com gradient sutil do status. Edit por seção como fallback rolling out.
4. **Mobile** — ✅ **Rethink real** (bottom nav, cards verticais, bottom sheets). Investimento aceito (~70h total).
5. **Ilustrações empty states** — ✅ **6 SVGs custom** monoline charcoal-300 + spots blue-500/gold-500 (Fase D6 dedicada).
6. **Lottie / Motion library** — ✅ **Motion (ex-Framer Motion)** adicionada a partir de Fase D7 pra drag tilts, stagger, route transitions.
7. **Densidade** — ✅ **Coluna `densidade` em `users`** + página `/perfil → Aparência` (~2h extra na Fase D9).

**Próximo passo**: começar Fase D1 (Tokens e fundamentos). Aguardando "go" do owner.

---

## 14. Referências externas

**Fonte da verdade Credios**:
- `credios-website-v2/src/app/globals.css` — paleta + selection + dark
- `credios-website-v2/src/app/layout.tsx` — fontes via next/font
- `credios-website-v2` em si — visual reference em produção

**Design systems pra estudar**:
- Apple HIG — <https://developer.apple.com/design/human-interface-guidelines>
- Material Design 3 — <https://m3.material.io>
- Radix Themes — <https://www.radix-ui.com/themes/docs/overview/getting-started>

**Inspiração CRM/SaaS**:
- Linear changelog — <https://linear.app/changelog>
- Notion homepage tour — <https://www.notion.so/product>
- Stripe dashboard guide — <https://stripe.com/docs/dashboard>
- Vercel dashboard — <https://vercel.com>
- Pitch — <https://pitch.com>

**Glassmorphism específico**:
- "Glassmorphism in CSS" — Hype4 generator <https://hype4.academy/tools/glassmorphism-generator>
- Apple "Designing for visionOS" — princípios de materiais <https://developer.apple.com/design/human-interface-guidelines/materials>

**Motion**:
- Motion (ex-Framer Motion) docs — <https://motion.dev>
- Material Motion tokens — <https://m3.material.io/styles/motion>

**Color**:
- OKLCH picker — <https://oklch.com>
- Huetone (contrast checker palette) — <https://huetone.ardov.me>

**Tipografia (fontes Credios)**:
- Plus Jakarta Sans — <https://github.com/tokotype/PlusJakartaSans>
- Space Grotesk — <https://floriankarsten.com/spacegrotesk>
- Fraunces — <https://fonts.google.com/specimen/Fraunces>
- Inter — <https://rsms.me/inter>
- Outfit — <https://fonts.google.com/specimen/Outfit>

**Acessibilidade**:
- WAI-ARIA Authoring Practices — <https://www.w3.org/WAI/ARIA/apg/>
- Tailwind CSS a11y guide — <https://tailwindcss.com/docs/screen-readers>

**Empty states**:
- Storyset — <https://storyset.com> (referência de estilo monoline)
- Hero Patterns — <https://heropatterns.com> (texturas sutis SVG)
