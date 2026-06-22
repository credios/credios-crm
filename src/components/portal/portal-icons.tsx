/**
 * Ícones bespoke do portal — duotone (base preenchida em tom de marca + traço
 * fino por cima), geometria própria. Evita a cara de "ícone genérico de IA".
 * Usam currentColor: a cor vem do container (credios-blue).
 */

export type PortalIconName =
  | "titular"
  | "renda"
  | "estado_civil"
  | "conjuge"
  | "imovel"
  | "enviar"
  | "seguranca"
  | "personalizado";

const COMMON = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  xmlns: "http://www.w3.org/2000/svg",
};
const S = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const FILL = { fill: "currentColor", opacity: 0.16 };

export function PortalIcon({
  name,
  className,
}: {
  name: PortalIconName;
  className?: string;
}) {
  switch (name) {
    // Titular — crachá/identidade: pessoa dentro de um cartão.
    case "titular":
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <rect x="4" y="3.2" width="16" height="17.6" rx="4.2" {...FILL} />
          <circle cx="12" cy="10" r="2.7" {...S} />
          <path d="M7.5 17.6c0-2.5 2-4.1 4.5-4.1s4.5 1.6 4.5 4.1" {...S} />
        </svg>
      );
    // Renda — carteira com pestana e fecho.
    case "renda":
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <rect x="3" y="6.2" width="18" height="12.6" rx="3.4" {...FILL} />
          <rect x="3" y="6.2" width="18" height="12.6" rx="3.4" {...S} />
          <path d="M3.2 10.4h11.3" {...S} opacity={0.7} />
          <circle cx="16.8" cy="12.8" r="1.5" fill="currentColor" />
        </svg>
      );
    // Estado civil — certidão com selo.
    case "estado_civil":
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <rect x="4.6" y="3" width="11.4" height="15.4" rx="2.6" {...FILL} />
          <path d="M7.6 7.2h5.4M7.6 10.2h5.4M7.6 13.2h3.2" {...S} />
          <circle cx="16.4" cy="15.8" r="3.4" {...S} />
          <path d="M16.4 14.2l.7 1.3 1.4.2-1 1 .2 1.4-1.3-.7-1.3.7.2-1.4-1-1 1.4-.2.7-1.3z" {...FILL} opacity={0.9} />
        </svg>
      );
    // Cônjuge — dois anéis entrelaçados.
    case "conjuge":
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <circle cx="9" cy="12.5" r="5.1" {...FILL} />
          <circle cx="9" cy="12.5" r="5.1" {...S} />
          <circle cx="15" cy="12.5" r="5.1" {...S} opacity={0.6} />
        </svg>
      );
    // Imóvel — casa com porta.
    case "imovel":
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M6 10.2V19a1 1 0 001 1h10a1 1 0 001-1v-8.8" {...FILL} />
          <path d="M3.6 11.4 12 4.2l8.4 7.2" {...S} />
          <path d="M6 10.4V19a1 1 0 001 1h10a1 1 0 001-1v-8.6" {...S} />
          <path d="M10 20v-4.2a2 2 0 012-2 2 2 0 012 2V20" {...S} />
        </svg>
      );
    // Enviar aos poucos — seta pra cima saindo de uma bandeja.
    case "enviar":
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M5 14.5V18a2.5 2.5 0 002.5 2.5h9A2.5 2.5 0 0019 18v-3.5" {...FILL} />
          <path d="M5 14.5V18a2.5 2.5 0 002.5 2.5h9A2.5 2.5 0 0019 18v-3.5" {...S} />
          <path d="M12 16V4.2M8.4 7.6 12 4l3.6 3.6" {...S} />
        </svg>
      );
    // Segurança — escudo com check.
    case "seguranca":
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M12 3.2l7 2.4v4.8c0 4.5-3 7.6-7 9.2-4-1.6-7-4.7-7-9.2V5.6l7-2.4z" {...FILL} />
          <path d="M12 3.2l7 2.4v4.8c0 4.5-3 7.6-7 9.2-4-1.6-7-4.7-7-9.2V5.6l7-2.4z" {...S} />
          <path d="M9 12l2 2 4-4.2" {...S} />
        </svg>
      );
    // Personalizado — faísca/estrela 4 pontas elegante.
    case "personalizado":
      return (
        <svg {...COMMON} className={className} aria-hidden>
          <path d="M12 3.2c.5 4.4 1.9 5.8 6.3 6.3-4.4.5-5.8 1.9-6.3 6.3-.5-4.4-1.9-5.8-6.3-6.3 4.4-.5 5.8-1.9 6.3-6.3z" {...FILL} />
          <path d="M12 3.2c.5 4.4 1.9 5.8 6.3 6.3-4.4.5-5.8 1.9-6.3 6.3-.5-4.4-1.9-5.8-6.3-6.3 4.4-.5 5.8-1.9 6.3-6.3z" {...S} />
          <path d="M18.2 16.4c.2 1.6.7 2.1 2.3 2.3-1.6.2-2.1.7-2.3 2.3-.2-1.6-.7-2.1-2.3-2.3 1.6-.2 2.1-.7 2.3-2.3z" fill="currentColor" />
        </svg>
      );
  }
}
