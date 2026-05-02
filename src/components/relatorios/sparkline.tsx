type Point = { valor: number };

type Props = {
  points: Point[];
  width?: number;
  height?: number;
  /** Cor da linha — default: var(--primary). */
  color?: string;
  /** Preenche área abaixo da linha com gradient sutil. */
  fill?: boolean;
  className?: string;
};

/**
 * Sparkline minimalista em SVG inline. Sem dependência (Recharts pesa demais
 * pra um chart de 60×24px). Usado nos KPIs do Painel Executivo.
 */
export function Sparkline({
  points,
  width = 80,
  height = 24,
  color = "currentColor",
  fill = true,
  className,
}: Props) {
  if (points.length < 2) {
    return (
      <span
        className={className}
        style={{ display: "inline-block", width, height }}
      />
    );
  }

  const values = points.map((p) => p.valor);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1; // -1 padding
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`))
    .join(" ");

  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      style={{ overflow: "visible" }}
      aria-hidden
    >
      {fill && (
        <>
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#spark-fill)" />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.length > 0 && (
        <circle
          cx={coords[coords.length - 1]![0]}
          cy={coords[coords.length - 1]![1]}
          r={2}
          fill={color}
        />
      )}
    </svg>
  );
}
