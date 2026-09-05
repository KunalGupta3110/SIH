import { useMemo } from "react";

/**
 * Bottom floating strip — a real 24-hour event histogram, not a fabricated
 * one. The backend doesn't expose a raw per-event list endpoint, but every
 * incident's `nodes[]` array (from /incidents/correlated) already carries
 * a real timestamp_iso per underlying detection event, so this buckets
 * those into 24 hourly bins. It undercounts real event volume whenever an
 * incident has aged out of the default /incidents/correlated?limit=50
 * window, which is the one honest caveat worth flagging.
 */
export default function EventSeriesStrip({ incidents = [] }) {
  const { buckets, total } = useMemo(() => {
    const now = Date.now();
    const bins = new Array(24).fill(0);
    let count = 0;
    for (const inc of incidents) {
      for (const node of inc.nodes || []) {
        const t = Date.parse(node.timestamp_iso || "");
        if (Number.isNaN(t)) continue;
        const ageHours = (now - t) / 3_600_000;
        if (ageHours < 0 || ageHours >= 24) continue;
        const bucketIndex = 23 - Math.floor(ageHours);
        bins[bucketIndex] += 1;
        count += 1;
      }
    }
    return { buckets: bins, total: count };
  }, [incidents]);

  const max = Math.max(1, ...buckets);

  return (
    <div className="absolute bottom-4 left-72 right-[22rem] rounded-lg border border-white/10 bg-black/55 backdrop-blur-md px-4 py-2.5 flex items-center gap-4 z-10">
      <span className="font-mono text-[10px] text-slate-500 shrink-0">EVENT SERIES</span>
      <div className="flex-1 flex items-end gap-[3px] h-8">
        {buckets.map((count, i) => (
          <div
            key={i}
            title={`${count} event(s), ${23 - i}-${24 - i}h ago`}
            className={`flex-1 rounded-sm ${count > max * 0.66 ? "bg-red-400/70" : "bg-sky-500/50"}`}
            style={{ height: `${Math.max(6, (count / max) * 100)}%` }}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] text-slate-500 shrink-0">{total} EVENTS · 24H</span>
    </div>
  );
}
