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

export const STATUS_COLOR: Record<string, string> = {
  novo: "#4b7be5",
  conversa_inicial: "#91b0f6",
  aguardando_resposta: "#d4a351",
  aguardando_documentacao: "#b8893a",
  documentacao_enviada: "#6366f1",
  em_negociacao: "#8b5cf6",
  fechado: "#10b981",
  perdido: "#f43f5e",
  sem_resposta: "#6e7891",
  desqualificado: "#dc2626",
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
