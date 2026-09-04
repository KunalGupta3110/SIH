import SectionHeader from "./SectionHeader.jsx";

export default function MapPanel({ incidents }) {
  const latest = incidents?.[0];
  const label = latest
    ? `${latest.incident_id} · score ${latest.threat_score}/100`
    : "No active incident";

  return (
    <div>
      <SectionHeader
        title="Tactical Digital Twin"
        sub="Camera fields of view and the geofenced corridor between Checkpost Alpha and BOP Bravo."
      />
      <div className="rounded-[4px] border border-line bg-panel2 p-4">
        <svg viewBox="0 0 900 340" className="w-full">
          <rect x="60" y="130" width="780" height="80" fill="rgba(214,83,74,0.09)" stroke="#D6534A" strokeDasharray="4 4" strokeWidth="1.2" />
          <text x="450" y="120" fill="#8B6A67" fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">
            RESTRICTED BORDER CORRIDOR
          </text>

          <circle cx="170" cy="170" r="12" fill="#0E1013" stroke="#E8A33D" strokeWidth="2" />
          <path d="M 170 170 L 250 115 L 250 225 Z" fill="rgba(232,163,61,0.10)" stroke="#E8A33D" strokeWidth="1" />
          <text x="170" y="255" fill="#E8A33D" fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">
            CAM_ALPHA
          </text>

          <circle cx="730" cy="170" r="12" fill="#0E1013" stroke="#5C93B8" strokeWidth="2" />
          <path d="M 730 170 L 650 115 L 650 225 Z" fill="rgba(92,147,184,0.10)" stroke="#5C93B8" strokeWidth="1" />
          <text x="730" y="255" fill="#5C93B8" fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">
            CAM_BRAVO
          </text>

          {latest && (
            <>
              <line x1="210" y1="170" x2="690" y2="170" stroke="#E8A33D" strokeWidth="1.5" strokeDasharray="5 6" opacity="0.6" />
              <circle cx="470" cy="170" r="6" fill="#D6534A">
                <animate attributeName="r" values="5;8;5" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </>
          )}
          <text x="470" y="150" fill="#D6534A" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" textAnchor="middle">
            {label}
          </text>
        </svg>
      </div>
    </div>
  );
}
