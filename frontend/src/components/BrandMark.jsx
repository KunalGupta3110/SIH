/* IBVAP Sentinel brand mark — a sentinel shield carrying the national
   tricolour with an Ashoka-style chakra ring at its heart. Used in every
   header so the identity is consistent. The wordmark uses text-white so
   it flips automatically under the light-mode palette remap. */

export const TRI = { saffron: "#FF9933", white: "#ffffff", green: "#138808", navy: "#0a0a3c" };

export function BrandLogo({ size = 32, className = "" }) {
  const spokes = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
  const SHIELD = "M16 1.5 L28 5.5 V16 C28 24 22 28.5 16 30.5 C10 28.5 4 24 4 16 V5.5 Z";
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={`brand-logo ${className}`} role="img" aria-label="IBVAP Sentinel">
      <defs>
        <clipPath id="ibvap-shield">
          <path d={SHIELD} />
        </clipPath>
      </defs>
      <g clipPath="url(#ibvap-shield)">
        <rect x="0" y="0" width="32" height="11" fill={TRI.saffron} />
        <rect x="0" y="11" width="32" height="10" fill="#ffffff" />
        <rect x="0" y="21" width="32" height="11" fill={TRI.green} />
      </g>
      <g stroke={TRI.navy} fill="none">
        <circle cx="16" cy="16" r="4.4" strokeWidth="1" />
        <circle cx="16" cy="16" r="0.9" fill={TRI.navy} stroke="none" />
        {spokes.map((a) => (
          <line
            key={a}
            x1="16"
            y1="16"
            x2={16 + Math.cos((a * Math.PI) / 180) * 4.4}
            y2={16 + Math.sin((a * Math.PI) / 180) * 4.4}
            strokeWidth="0.55"
          />
        ))}
      </g>
      <path d={SHIELD} fill="none" stroke={TRI.navy} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export default function BrandMark({
  size = 30,
  subtitle,
  wordClass = "text-[13px] font-bold tracking-tight text-white",
  subClass = "text-[10px] font-medium text-white/55",
  className = "",
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <BrandLogo size={size} className="shrink-0" />
      <span className="leading-none">
        <span className={`block ${wordClass}`}>IBVAP Sentinel</span>
        {subtitle && <span className={`mt-1 block ${subClass}`}>{subtitle}</span>}
        <span className="mt-1 flex h-[2px] w-14 overflow-hidden rounded-full">
          <span className="flex-1" style={{ background: TRI.saffron }} />
          <span className="flex-1" style={{ background: "#e8e8e8" }} />
          <span className="flex-1" style={{ background: TRI.green }} />
        </span>
      </span>
    </span>
  );
}
