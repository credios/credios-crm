// Paleta e estilos compartilhados pra Recharts — todos os charts consomem
// daqui pra manter coerência visual com brand Credios.

export const CHART_COLORS = [
  "#4b7be5", // blue-500 (Credios)
  "#d4a351", // gold-500 (Credios)
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#91b0f6", // blue-300
  "#95702e", // gold-700
  "#6366f1", // indigo
  "#6e7891", // charcoal-300
  "#2c4fa8", // blue-700
] as const;

// Cores fixas por canal — garantem consistência visual entre o gráfico
// inteiro e qualquer filtro aplicado (AI Assistant sempre roxo, Paid Search
// sempre azul, etc). Sem isso, o map de cor depende da ordem de aparição
// e muda quando o usuário filtra.
export const CHANNEL_COLOR: Record<string, string> = {
  "Paid Search":    "#4b7be5",  // blue-500 — Google Ads é o "azul forte" do CRM
  "Paid Social":    "#0ea5e9",  // sky-500
  "Paid Video":     "#dc2626",  // red-600 — alinha com YouTube branding
  "Paid Display":   "#f97316",  // orange-500
  "Organic Search": "#10b981",  // emerald-500
  "Organic Social": "#ec4899",  // pink-500
  "AI Assistant":   "#8b5cf6",  // violet-500 — destaque pra categoria nova
  "Direct":         "#94a3b8",  // slate-400 — neutro
  "Referral":       "#6366f1",  // indigo-500
  "Indicação":      "#d4a351",  // gold-500 — premium (cliente que indica)
  "Email":          "#06b6d4",  // cyan-500
  "Manual":         "#71717a",  // zinc-500
  "Sem canal":      "#cbd5e1",  // slate-300 — fallback
};

// Sincronizado com --color-status-* em globals.css. Progressão do funil:
// frio (azul) → quente (amarelo/laranja) → verde (won) ou vermelho (lost).
export const STATUS_COLOR: Record<string, string> = {
  novo: "#4b7be5",                  // blue-500   — entrada
  conversa_inicial: "#38bdf8",      // sky-400    — esquentando
  aguardando_resposta: "#eab308",   // yellow-500 — atenção
  aguardando_documentacao: "#f97316", // orange-500 — urgente
  documentacao_enviada: "#6366f1",  // indigo-500 — andamento
  em_negociacao: "#8b5cf6",         // violet-500 — fechando
  fechado: "#10b981",               // emerald-500 — sucesso
  perdido: "#f43f5e",               // rose-500
  desqualificado: "#dc2626",        // red-600
};

export const TOOLTIP_STYLE: React.CSSProperties = {
  background: "color-mix(in oklch, var(--popover) 78%, transparent)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow:
    "0 16px 40px -8px color-mix(in oklch, var(--foreground) 24%, transparent), 0 8px 16px -6px color-mix(in oklch, var(--foreground) 16%, transparent)",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
  padding: "8px 10px",
  backdropFilter: "blur(16px) saturate(1.6)",
  WebkitBackdropFilter: "blur(16px) saturate(1.6)",
  color: "var(--foreground)",
};

export const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
};

export const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: 11,
};

export const AXIS_TICK = {
  fontSize: 11,
  fill: "var(--color-fg-subtle, #6e7891)",
  fontFamily: "var(--font-mono)",
};

export const GRID_STROKE = "color-mix(in oklch, var(--foreground) 6%, transparent)";
