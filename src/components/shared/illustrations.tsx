// 6 ilustrações monoline pra empty states.
// Stroke 1.5px charcoal-300 + accents Credios (blue-500 / gold-500).
// ViewBox quadrado 200×200, fundo transparente.

const STROKE = "currentColor";
const BLUE = "#4b7be5";
const GOLD = "#d4a351";

type IllProps = { className?: string };

export function EmptyLeads({ className }: IllProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke={STROKE}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M30 50 L170 50 L120 110 L120 160 L80 145 L80 110 Z" />
      <circle cx="100" cy="35" r="4" fill={BLUE} stroke="none" opacity="0.85" />
      <circle cx="76" cy="28" r="2.5" fill={BLUE} stroke="none" opacity="0.5" />
      <circle cx="124" cy="28" r="2.5" fill={GOLD} stroke="none" opacity="0.7" />
      <circle cx="60" cy="22" r="1.8" fill={BLUE} stroke="none" opacity="0.35" />
      <circle cx="140" cy="22" r="1.8" fill={GOLD} stroke="none" opacity="0.4" />
      <line x1="40" y1="80" x2="160" y2="80" opacity="0.4" />
      <line x1="55" y1="100" x2="145" y2="100" opacity="0.3" />
    </svg>
  );
}

export function EmptyKanban({ className }: IllProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke={STROKE}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="20" y="40" width="48" height="120" rx="6" opacity="0.6" />
      <rect x="76" y="40" width="48" height="120" rx="6" opacity="0.6" />
      <rect x="132" y="40" width="48" height="120" rx="6" opacity="0.6" />
      <rect
        x="28"
        y="56"
        width="32"
        height="22"
        rx="3"
        fill={BLUE}
        stroke="none"
        opacity="0.18"
      />
      <rect
        x="28"
        y="84"
        width="32"
        height="22"
        rx="3"
        opacity="0.4"
        strokeDasharray="3 3"
      />
      <rect
        x="84"
        y="56"
        width="32"
        height="22"
        rx="3"
        opacity="0.4"
        strokeDasharray="3 3"
      />
      <rect
        x="140"
        y="56"
        width="32"
        height="22"
        rx="3"
        fill={GOLD}
        stroke="none"
        opacity="0.2"
      />
      <line x1="20" y1="56" x2="68" y2="56" stroke={BLUE} opacity="0.6" strokeWidth="2" />
      <line x1="76" y1="56" x2="124" y2="56" opacity="0.5" strokeWidth="2" />
      <line x1="132" y1="56" x2="180" y2="56" stroke={GOLD} opacity="0.6" strokeWidth="2" />
    </svg>
  );
}

export function EmptyAlerts({ className }: IllProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke={STROKE}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M70 130 Q100 55 130 130 Z" opacity="0.7" />
      <path d="M65 130 L135 130" opacity="0.7" />
      <path d="M88 138 Q100 152 112 138" opacity="0.7" />
      <circle cx="100" cy="98" r="22" fill={BLUE} fillOpacity="0.12" stroke="none" />
      <path
        d="M88 100 L97 109 L114 90"
        stroke="#10b981"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M40 60 L48 60 M40 90 L48 90 M40 120 L48 120"
        opacity="0.3"
      />
      <path
        d="M152 60 L160 60 M152 90 L160 90 M152 120 L160 120"
        opacity="0.3"
      />
    </svg>
  );
}

export function EmptyTemplates({ className }: IllProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke={STROKE}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path
        d="M55 35 L140 35 Q150 35 150 45 L150 165 Q150 175 140 175 L55 175 Q45 175 45 165 L45 45 Q45 35 55 35 Z"
        opacity="0.7"
      />
      <line x1="60" y1="60" x2="125" y2="60" opacity="0.45" />
      <line x1="60" y1="78" x2="135" y2="78" opacity="0.4" />
      <line x1="60" y1="96" x2="115" y2="96" opacity="0.4" />
      <line x1="60" y1="114" x2="130" y2="114" opacity="0.35" />
      <line x1="60" y1="132" x2="100" y2="132" opacity="0.3" />
      <path
        d="M135 110 L165 80 Q172 73 165 66 L155 56 Q148 49 141 56 L111 86 L106 102 L122 97 Z"
        fill={GOLD}
        fillOpacity="0.18"
        stroke={GOLD}
        strokeWidth="1.5"
      />
      <line x1="116" y1="92" x2="129" y2="105" stroke={GOLD} opacity="0.7" />
    </svg>
  );
}

export function EmptyAudit({ className }: IllProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke={STROKE}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="100" cy="100" r="55" opacity="0.65" />
      <circle cx="100" cy="100" r="48" opacity="0.4" strokeDasharray="2 4" />
      <line x1="100" y1="60" x2="100" y2="100" strokeWidth="2" />
      <line
        x1="100"
        y1="100"
        x2="125"
        y2="115"
        strokeWidth="2"
        stroke={BLUE}
      />
      <circle cx="100" cy="100" r="3.5" fill={BLUE} stroke="none" />
      <path
        d="M100 30 L106 38 L94 38 Z"
        opacity="0.55"
      />
      <path
        d="M155 155 L168 168 M153 156 L160 158 L158 165"
        stroke="#10b981"
        strokeWidth="2"
      />
    </svg>
  );
}

export function EmptyRules({ className }: IllProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke={STROKE}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="68" cy="100" r="32" opacity="0.7" />
      <circle cx="68" cy="100" r="6" fill={BLUE} fillOpacity="0.25" stroke={BLUE} />
      <path
        d="M68 60 L68 68 M68 132 L68 140 M28 100 L36 100 M100 100 L108 100 M40 72 L46 78 M90 122 L96 128 M40 128 L46 122 M90 78 L96 72"
      />
      <circle cx="138" cy="100" r="22" opacity="0.65" />
      <circle cx="138" cy="100" r="4" fill={GOLD} fillOpacity="0.4" stroke={GOLD} />
      <path
        d="M138 70 L138 78 M138 122 L138 130 M110 100 L118 100 M158 100 L166 100"
      />
      <line x1="100" y1="100" x2="116" y2="100" strokeDasharray="2 3" stroke={BLUE} opacity="0.7" />
    </svg>
  );
}
