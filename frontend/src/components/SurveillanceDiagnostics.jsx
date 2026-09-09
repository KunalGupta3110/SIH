import { useMemo } from "react";
import { Activity, Gauge, Cloud, ScanLine, ScanFace, FlaskConical } from "lucide-react";

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
  return (
    <div className="rounded-2xl border border-white/12 bg-[#000000] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-heading text-[13px] font-semibold text-white">
          <FlaskConical size={15} /> ANPR &amp; face recognition
        </span>
        <span className="font-mono text-[10px] text-white/40">plate OCR · watch-list gallery match</span>
      </div>
      <p className="text-[11px] font-medium leading-relaxed text-white/50">
        Plate OCR runs on the tracked vehicle stream and face crops are matched against the watch-list gallery — hits
        surface here and open an incident on the watchfloor.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-white/45">
            <ScanLine size={12} /> ANPR — plate reads
          </div>
          <ul className="mt-2 space-y-1.5">
            {PLATES.map((p) => (
              <li key={p.plate} className="flex items-center gap-2 border border-white/10 px-2.5 py-1.5">
                <span className="flex-1 font-mono text-[12px] tracking-wide text-white">{p.plate}</span>
                <span className="font-mono text-[10px] text-white/40">{p.cam}</span>
                <span className="font-mono text-[10px] tabular-nums text-white/50">{Math.round(p.conf * 100)}%</span>
                {p.hotlist && (
                  <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 font-mono text-[8.5px] font-medium text-rose-400">
                    hotlist
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-white/45">
            <ScanFace size={12} /> FRS — face matches
          </div>
          <ul className="mt-2 space-y-1.5">
            {FACES.map((f) => (
              <li key={f.id} className="flex items-center gap-2 border border-white/10 px-2.5 py-1.5">
                <span className="flex-1 font-mono text-[12px] text-white">{f.id}</span>
                <span className="font-mono text-[10px] text-white/40">{f.cam}</span>
                <span className={`font-mono text-[10px] tabular-nums ${f.hit ? "text-emerald-400" : "text-white/45"}`}>
                  {f.match.toFixed(1)}%
                </span>
                <span className="font-mono text-[9px] text-white/40">{f.list}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
