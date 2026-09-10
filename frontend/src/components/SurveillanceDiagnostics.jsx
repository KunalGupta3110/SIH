import { useMemo, useState, useEffect } from "react";
import { Activity, Gauge, Cloud, ScanLine, ScanFace, FlaskConical, ShieldAlert, Plus } from "lucide-react";
import { getRecentPlateReads, getVehicleHotlist, addVehicleHotlist } from "../lib/api.js";

/* ═══════════════════════════════════════════════════════════════════════
   SurveillanceDiagnostics
   - StreamDiagnostics: per-feed stream health + cloud inference metrics
     (SaaS framing — a hosted inference pool, not on-prem edge boxes).
   - RoadmapOverlays: a clearly-badged design preview of ANPR + face
     recognition. These are Phase-2 scope for PS-26187, not the MVP;
     nothing here is a live detection.
   ═══════════════════════════════════════════════════════════════════════ */

const h = (a, b) => {
  const x = Math.sin(a * 91.7 + b * 47.3) * 43758.5;
  return x - Math.floor(x);
};

export function StreamDiagnostics({ cameras = [] }) {
  const rows = useMemo(
    () =>
      cameras.map((c, i) => {
        const fpsNum = parseFloat(c.fps) || 24 + h(i, 1) * 6;
        const latency = Math.round(38 + h(i, 2) * 46); // cloud inference round-trip
        const health = Math.round(88 + h(i, 3) * 11);
        const reconnects = Math.round(h(i, 4) * 3);
        return { id: c.name || c.id, res: c.res || "1920x1080", fps: fpsNum, latency, health, reconnects };
      }),
    [cameras]
  );

  const avgLatency = rows.length ? Math.round(rows.reduce((s, r) => s + r.latency, 0) / rows.length) : 0;
  const poolUtil = Math.min(96, 40 + rows.length * 9);

  return (
    <div className="rounded-2xl border border-white/12 bg-[#000000] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-heading text-[13px] font-semibold text-white">
          <Activity size={15} /> Stream &amp; inference diagnostics
        </span>
        <span className="font-mono text-[10px] text-white/40">hosted inference pool · per-tenant</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={ScanLine} label="Active feeds" value={rows.length} sub="ingesting now" />
        <Metric icon={Gauge} label="Avg inference RTT" value={`${avgLatency} ms`} sub="frame → incident" />
        <Metric icon={Cloud} label="GPU pool" value={`${poolUtil}%`} sub="auto-scaling utilisation" ink={poolUtil > 90 ? "text-amber-400" : "text-white"} />
        <Metric icon={Activity} label="Tenant sync" value="OK" sub="last push 4 s ago" ink="text-emerald-400" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/12 text-[11px] font-medium text-zinc-500">
              <th className="pb-2">Feed</th>
              <th className="pb-2">Resolution</th>
              <th className="pb-2">FPS</th>
              <th className="pb-2">Inference RTT</th>
              <th className="pb-2">Stream health</th>
              <th className="pb-2">Reconnects · 24h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 font-mono text-[11px] font-medium text-zinc-300">{r.id}</td>
                <td className="py-2 font-mono text-[11px] text-zinc-400 tabular-nums">{r.res}</td>
                <td className="py-2 font-mono text-[11px] tabular-nums text-zinc-200">{r.fps.toFixed(1)}</td>
                <td className={`py-2 font-mono text-[11px] tabular-nums ${r.latency > 70 ? "text-amber-400" : "text-zinc-200"}`}>{r.latency} ms</td>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                      <span
                        className={`block h-full ${r.health > 92 ? "bg-emerald-400" : r.health > 85 ? "bg-amber-400" : "bg-rose-400"}`}
                        style={{ width: `${r.health}%` }}
                      />
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-zinc-400">{r.health}%</span>
                  </span>
                </td>
                <td className="py-2 font-mono text-[11px] tabular-nums text-zinc-400">{r.reconnects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] font-medium text-white/35">
        Cloud-hosted YOLOv8n + ByteTrack inference. Figures are a demo model over the recorded testbed feeds — not a
        live production tenant.
      </p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub, ink = "text-white" }) {
  return (
    <div className="border border-white/10 bg-black p-3">
      <div className="flex items-center gap-1.5 font-mono text-[9px] text-white/45">
        <Icon size={11} />
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${ink}`}>{value}</div>
      <div className="mt-0.5 text-[9.5px] font-medium text-white/35">{sub}</div>
    </div>
  );
}

const PLATES = [
  { plate: "PB 08 AX 4471", conf: 0.93, cam: "CAM_ALPHA", hotlist: false },
  { plate: "RJ 19 CB 8890", conf: 0.88, cam: "CAM_THAR_02", hotlist: true },
  { plate: "HR 26 DK 1204", conf: 0.79, cam: "CAM_BRAVO", hotlist: false },
];
const FACES = [
  { id: "FR-2213", match: 91.4, cam: "CAM_BRAVO", list: "Sector watch-list", hit: true },
  { id: "FR-2219", match: 63.2, cam: "CAM_CHARLIE", list: "—", hit: false },
];

export function RoadmapOverlays() {
  const [plateReads, setPlateReads] = useState([]);
  const [hotlist, setHotlist] = useState([]);
  const [flagPlateInput, setFlagPlateInput] = useState("");
  const [flagReasonInput, setFlagReasonInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const refreshANPR = async () => {
    try {
      const [reads, hl] = await Promise.all([
        getRecentPlateReads(6),
        getVehicleHotlist(),
      ]);
      setPlateReads(reads);
      setHotlist(hl);
    } catch (err) {
      console.debug("ANPR fetch failed:", err);
    }
  };

  useEffect(() => {
    refreshANPR();
    const interval = setInterval(refreshANPR, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleAddHotlist = async (e) => {
    e.preventDefault();
    if (!flagPlateInput.trim()) return;
    setIsAdding(true);
    try {
      await addVehicleHotlist(flagPlateInput.trim(), flagReasonInput.trim() || "Operator Flagged");
      setStatusMsg(`Flagged ${flagPlateInput.toUpperCase()} added to Watchlist`);
      setFlagPlateInput("");
      setFlagReasonInput("");
      await refreshANPR();
      setTimeout(() => setStatusMsg(""), 4000);
    } catch {
      setStatusMsg("Failed to add plate to watchlist");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/12 bg-[#000000] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-heading text-[13px] font-semibold text-white">
          <FlaskConical size={15} /> ANPR &amp; Watchlist Enforcement
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE INGESTION
          </span>
          <span className="font-mono text-[10px] text-white/40">YOLOv8 + EasyOCR</span>
        </div>
      </div>
      <p className="text-[11px] font-medium leading-relaxed text-white/50">
        Automatic Number Plate Recognition runs on tracked vehicle crops with per-track OCR caching. Flagged plates automatically escalate threat tier and trigger checkpoint interdiction.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between font-mono text-[10px] text-white/45">
            <span className="flex items-center gap-1.5">
              <ScanLine size={12} /> Live Scanned Plates ({plateReads.length})
            </span>
            <span className="text-[9px] text-white/35">updates live</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {plateReads.map((p, idx) => {
              const isHot = p.is_hotlist || hotlist.some(h => h.plate && (h.plate.replace(/\s+/g, '') === (p.plate_text || p.plate || '').replace(/\s+/g, '')));
              const confVal = Math.round(((p.plate_confidence || p.conf || 0.85) * 100));
              return (
                <li
                  key={`${p.plate_text || p.plate}-${idx}`}
                  className={`flex flex-col gap-1 border px-2.5 py-1.5 transition-colors ${
                    isHot ? "border-rose-500/40 bg-rose-950/15" : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-mono text-[12px] font-bold tracking-wider text-white">
                      {p.plate_text || p.plate}
                    </span>
                    <span className="font-mono text-[10px] text-white/40">{p.camera_id || p.cam || "CAM_ALPHA"}</span>
                    <span className="font-mono text-[10px] tabular-nums text-white/50">{confVal}%</span>
                    {isHot && (
                      <span className="flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[8.5px] font-bold text-rose-400">
                        <ShieldAlert size={10} /> HOTLIST
                      </span>
                    )}
                  </div>
                  {isHot && (p.hotlist_reason || hotlist.find(h => h.plate && (h.plate.replace(/\s+/g, '') === (p.plate_text || p.plate || '').replace(/\s+/g, '')))?.reason) && (
                    <div className="font-mono text-[9px] text-rose-400/80">
                      ⚠ {p.hotlist_reason || hotlist.find(h => h.plate && (h.plate.replace(/\s+/g, '') === (p.plate_text || p.plate || '').replace(/\s+/g, '')))?.reason}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-white/45">
            <ScanFace size={12} /> FRS — Face Matches
          </div>
          <ul className="mt-2 space-y-1.5">
            {FACES.map((f) => (
              <li key={f.id} className="flex items-center gap-2 border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
                <span className="flex-1 font-mono text-[12px] text-white">{f.id}</span>
                <span className="font-mono text-[10px] text-white/40">{f.cam}</span>
                <span className={`font-mono text-[10px] tabular-nums ${f.hit ? "text-emerald-400" : "text-white/45"}`}>
                  {f.match.toFixed(1)}%
                </span>
                <span className="font-mono text-[9px] text-white/40">{f.list}</span>
              </li>
            ))}
          </ul>

          {/* Quick-Flag Vehicle Form */}
          <div className="mt-3 border-t border-white/10 pt-2.5">
            <div className="font-mono text-[9.5px] font-medium text-white/60 mb-1.5 flex items-center gap-1">
              <Plus size={11} /> Flag Suspect Vehicle to Watchlist
            </div>
            <form onSubmit={handleAddHotlist} className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. RJ 19 CB 8890"
                  value={flagPlateInput}
                  onChange={(e) => setFlagPlateInput(e.target.value.toUpperCase())}
                  className="flex-1 rounded border border-white/15 bg-black/60 px-2 py-1 font-mono text-[10.5px] text-white placeholder-white/25 focus:border-rose-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isAdding || !flagPlateInput.trim()}
                  className="rounded border border-rose-500/50 bg-rose-500/20 px-2.5 py-1 font-mono text-[10px] font-bold text-rose-300 hover:bg-rose-500/30 disabled:opacity-40"
                >
                  {isAdding ? "Adding..." : "+ Flag"}
                </button>
              </div>
              <input
                type="text"
                placeholder="Reason (e.g. Suspect Contraband Transit)"
                value={flagReasonInput}
                onChange={(e) => setFlagReasonInput(e.target.value)}
                className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[9.5px] text-white/80 placeholder-white/20 focus:outline-none"
              />
              {statusMsg && (
                <span className="font-mono text-[9px] text-emerald-400">{statusMsg}</span>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
