// Line icons from Lucide (ISC License — Lucide Contributors), kept as
// plain SVG so they inherit the control's colour through currentColor.
// The buttons carry their own aria-labels, so the drawings stay out of
// the accessibility tree.

const STROKE = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

// The button that slides one station west.
export function SkipBackIcon({ size = 14 }) {
  return (
    <svg {...STROKE} width={size} height={size}>
      <path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" />
      <path d="M3 20V4" />
    </svg>
  );
}

export function PlayIcon({ size = 17 }) {
  return (
    <svg {...STROKE} width={size} height={size}>
      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
    </svg>
  );
}

export function PauseIcon({ size = 17 }) {
  return (
    <svg {...STROKE} width={size} height={size}>
      <rect x="14" y="3" width="5" height="18" rx="1" />
      <rect x="5" y="3" width="5" height="18" rx="1" />
    </svg>
  );
}

export function ClearIcon({ size = 14 }) {
  return (
    <svg {...STROKE} width={size} height={size}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function SearchIcon({ size = 15 }) {
  return (
    <svg {...STROKE} width={size} height={size}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

// Favorites: an outline star, filled once the station is saved.
export function StarIcon({ size = 15, filled = false }) {
  return (
    <svg
      {...STROKE}
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
    >
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.395 20.82a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.604a.53.53 0 0 1 .294-.904l5.166-.756a2.122 2.122 0 0 0 1.595-1.16z" />
    </svg>
  );
}

// The top-right list entry: saved stations, not the star switch below.
export function ListIcon({ size = 15 }) {
  return (
    <svg {...STROKE} width={size} height={size}>
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
    </svg>
  );
}

export function ShuffleIcon({ size = 18 }) {
  return (
    <svg {...STROKE} width={size} height={size}>
      <path d="m18 14 4 4-4 4" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
      <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
      <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
    </svg>
  );
}
