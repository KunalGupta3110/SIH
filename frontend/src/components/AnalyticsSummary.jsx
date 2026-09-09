import { useMemo, useState } from "react";
import { Activity, TrendingUp, Grid3x3 } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   AI ANALYTICS SUMMARY — visual layer for the Analytics view.
   Movement heatmap (day × hour), pedestrian vs vehicle trend, and a
   pattern-of-life readout. All figures are a deterministic synthetic
   model over the Sector 4-B testbed — labelled as such, not live CCTV.
   ═══════════════════════════════════════════════════════════════════════ */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// deterministic pseudo-random so the picture is stable across renders
const rng = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// night-weighted activity: quiet midday, busy 20:00–04:00 (the curfew window)
function activity(day, hour) {
  const night = hour >= 20 || hour <= 4 ? 1 : hour >= 5 && hour <= 8 ? 0.55 : 0.25;
  const weekend = day >= 5 ? 0.8 : 1;
  return Math.round((night * weekend * (0.55 + rng(day, hour) * 0.9)) * 42);
}

const HEAT = ["#111214", "#1c2a24", "#24503b", "#2f7d52", "#3ff09a"];
const heatColor = (v, max) => HEAT[Math.min(HEAT.length - 1, Math.floor((v / max) * HEAT.length))];

export default function AnalyticsSummary() {
  const [metric, setMetric] = useState("all"); // all | person | vehicle

  const grid = useMemo(
    () => DAYS.map((_, d) => HOURS.map((h) => activity(d, h))),
    []
  );
  const max = useMemo(() => Math.max(...grid.flat()), [grid]);

  // pedestrian vs vehicle split by hour (aggregated over the week)
  const trend = useMemo(
    () =>
      HOURS.map((h) => {
        const total = DAYS.reduce((s, _, d) => s + activity(d, h), 0);
        const vehShare = 0.28 + rng(h, 9) * 0.22 + (h >= 22 || h <= 3 ? 0.15 : 0);
        const vehicle = Math.round(total * Math.min(0.7, vehShare));
        return { h, person: total - vehicle, vehicle };
      }),
    []
  );
  const trendMax = useMemo(() => Math.max(...trend.map((t) => t.person + t.vehicle)), [trend]);

  const totals = useMemo(() => {
    const person = trend.reduce((s, t) => s + t.person, 0);
    const vehicle = trend.reduce((s, t) => s + t.vehicle, 0);
    const nightShare = Math.round(
      (grid.reduce((s, row) => s + row.filter((_, h) => h >= 20 || h <= 4).reduce((a, b) => a + b, 0), 0) /
        grid.flat().reduce((a, b) => a + b, 0)) *
        100
    );
    return { person, vehicle, nightShare };
  }, [grid, trend]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Tracks · 7d" value={(totals.person + totals.vehicle).toLocaleString()} sub="synthetic testbed model" />
        <Stat label="Pedestrian" value={totals.person.toLocaleString()} sub={`${Math.round((totals.person / (totals.person + totals.vehicle)) * 100)}% of movement`} />
        <Stat label="Vehicle" value={totals.vehicle.toLocaleString()} sub={`${Math.round((totals.vehicle / (totals.person + totals.vehicle)) * 100)}% of movement`} />
        <Stat label="Night window" value={`${totals.nightShare}%`} sub="activity in 20:00–05:00 IST" ink="text-amber-400" />
      </div>

      {/* movement heatmap */}
      <div className="rounded-2xl border border-white/12 bg-black p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 font-heading text-[13px] font-semibold text-white">
            <Grid3x3 size={15} /> Hourly movement heatmap
          </span>
          <span className="font-mono text-[10px] text-white/40">day × hour · relative track density</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="ml-9 grid gap-[2px]" style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}>
              {HOURS.map((h) => (
                <div key={h} className="text-center font-mono text-[8px] text-white/30">
                  {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                </div>
              ))}
            </div>
            {grid.map((row, d) => (
              <div key={d} className="mt-[2px] flex items-center gap-[2px]">
                <span className="w-8 shrink-0 font-mono text-[9px] text-white/40">{DAYS[d]}</span>
                <div className="grid flex-1 gap-[2px]" style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}>
                  {row.map((v, h) => (
                    <div
                      key={h}
                      title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 · ${v} tracks`}
                      className="aspect-square rounded-[2px]"
                      style={{ background: heatColor(v, max) }}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="ml-9 mt-2 flex items-center gap-2 font-mono text-[9px] text-white/40">
              low
              {HEAT.map((c) => (
                <span key={c} className="h-2 w-4 rounded-[2px]" style={{ background: c }} />
              ))}
              high
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* pedestrian vs vehicle trend */}
        <div className="rounded-2xl border border-white/12 bg-black p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 font-heading text-[13px] font-semibold text-white">
              <TrendingUp size={15} /> Pedestrian vs. vehicle · by hour
            </span>
            <div className="flex gap-1">
              {["all", "person", "vehicle"].map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`border px-2 py-0.5 font-mono text-[10px] capitalize transition-colors ${
                    metric === m ? "border-white/50 text-white" : "border-white/15 text-white/45 hover:text-white/80"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex h-40 items-stretch gap-[3px]">
            {trend.map((t) => {
              const showP = metric !== "vehicle";
              const showV = metric !== "person";
              return (
                <div key={t.h} className="group relative flex h-full flex-1 flex-col justify-end" title={`${String(t.h).padStart(2, "0")}:00 · ${t.person}P / ${t.vehicle}V`}>
                  {showV && <div className="w-full shrink-0 bg-white/70" style={{ height: `${(t.vehicle / trendMax) * 100}%` }} />}
                  {showP && <div className="w-full shrink-0 bg-white/25" style={{ height: `${(t.person / trendMax) * 100}%` }} />}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[8px] text-white/30">
            {[0, 6, 12, 18, 23].map((h) => (
              <span key={h}>{String(h).padStart(2, "0")}:00</span>
            ))}
          </div>
          <div className="mt-2 flex gap-4 font-mono text-[10px] text-white/50">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-white/25" /> pedestrian</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-white/70" /> vehicle</span>
          </div>
        </div>

        {/* pattern-of-life / anomaly readout */}
        <div className="rounded-2xl border border-white/12 bg-black p-4">
          <span className="flex items-center gap-2 font-heading text-[13px] font-semibold text-white">
            <Activity size={15} /> Pattern of life
          </span>
          <ul className="mt-3 space-y-2.5 text-[11.5px] font-medium leading-relaxed text-white/60">
            <li className="border-l-2 border-amber-400/60 pl-2.5">
              Movement concentrates in the <span className="text-white">20:00–04:00</span> curfew window — the additive
              night-window rule is doing most of the work.
            </li>
            <li className="border-l-2 border-white/20 pl-2.5">
              Vehicle share rises after midnight on the patrol-road corridor; pedestrian tracks dominate the fence line.
            </li>
            <li className="border-l-2 border-rose-400/60 pl-2.5">
              <span className="text-white">3 unrecognised loiter clusters</span> this week fell outside any known
              patrol pattern — flagged for review, not auto-scored.
            </li>
          </ul>
          <p className="mt-3 border-t border-white/10 pt-2 text-[10px] font-medium text-white/35">
            Deterministic synthetic model over the Sector 4-B two-angle testbed and public dataset clips (MOT17,
            VisDrone). Not live tactical CCTV.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, ink = "text-white" }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black p-4">
      <div className="font-mono text-[10px] text-white/45">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${ink}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-medium text-white/40">{sub}</div>
    </div>
  );
}
