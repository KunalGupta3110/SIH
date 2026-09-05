import { Shield, Video, GitBranch, Link2, CheckSquare, Map as MapIcon, Cpu, ExternalLink } from "lucide-react";

const NAV_ITEMS = [
  { key: "live", label: "Live Video Ops", icon: Video },
  { key: "incidents", label: "Correlated Incidents", icon: GitBranch },
  { key: "evidence", label: "Evidence Ledger", icon: Link2 },
  { key: "triage", label: "Operator Triage", icon: CheckSquare },
  { key: "map", label: "Tactical 2D Map", icon: MapIcon },
  { key: "zoo", label: "Model Reference", icon: Cpu },
];

export default function NavRail({ section, setSection, armState, onToggleArm, armPending }) {
  const armed = armState === "armed";

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-line bg-panel2">
      <div className="flex items-center gap-2 border-b border-line px-4 py-4">
        <Shield size={18} className="text-amber" strokeWidth={1.75} />
        <div>
          <div className="text-[13px] font-semibold tracking-wide text-ink">IBVAP SENTINEL</div>
          <div className="font-mono text-[9.5px] text-faint">SIH-26187 · SSB</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const active = section === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`flex items-center gap-2.5 rounded-[3px] border-l-2 px-2.5 py-2 text-left text-[12px] transition-colors ${
                active
                  ? "border-amber bg-amber/10 text-amberLight font-medium"
                  : "border-transparent text-dim hover:text-ink2"
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}

        {/* Plain external link to FastAPI Swagger Docs */}
        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-[3px] border-l-2 border-transparent px-2.5 py-2 text-left text-[12px] text-dim hover:text-ink2 mt-2 pt-2 border-t border-line/40"
        >
          <span className="flex items-center gap-2">
            <span>API Docs (Swagger)</span>
          </span>
          <ExternalLink size={12} className="text-dim2" />
        </a>
      </nav>

      <div className="border-t border-line px-3 py-3">
        <button
          onClick={onToggleArm}
          disabled={armPending}
          className={`flex w-full items-center justify-between rounded-[3px] border px-2.5 py-2 font-mono text-[11px] transition-opacity disabled:opacity-50 ${
            armed
              ? "border-red/35 bg-red/10 text-red font-semibold"
              : "border-green/35 bg-green/10 text-green font-semibold"
          }`}
        >
          <span>{armPending ? "…" : armed ? "SYSTEM ARMED" : "SYSTEM DISARMED"}</span>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
        </button>
      </div>
    </aside>
  );
}
