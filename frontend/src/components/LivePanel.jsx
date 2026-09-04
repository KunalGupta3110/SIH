import { Video } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";

// backend/main.py has no video-streaming endpoint yet (hardware_bridge.py
// falls back to SIMULATION MODE), so these two cards are honest visual
// placeholders for the camera nodes the simulate-handoff pipeline uses —
// not a real feed. Swap the mock <div> body for a <video>/<img> tag once
// a streaming endpoint exists.
const NODES = [
  { id: "CAM_ALPHA", name: "Checkpost Alpha", sub: "North Entry Gate", tint: "amber" },
  { id: "CAM_BRAVO", name: "BOP Bravo", sub: "Eastern Perimeter", tint: "blue" },
];

export default function LivePanel() {
  return (
    <div>
      <SectionHeader
        title="Live Multi-Camera Grid"
        sub="Edge inference target — YOLOv8 + ByteTrack, no new hardware. Feed rendering not yet wired to a streaming endpoint (placeholder below, labelled honestly)."
      />
      <div className="grid grid-cols-2 gap-4">
        {NODES.map((n) => (
          <div key={n.id} className="rounded-[4px] border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <div>
                <div className="text-[13px] font-medium">{n.name}</div>
                <div className="text-[11px] text-dim2">{n.sub}</div>
              </div>
              <span className={`flex items-center gap-1 font-mono text-[10.5px] ${n.tint === "amber" ? "text-amber" : "text-blue"}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
                {n.id}
              </span>
            </div>
            <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-[#08090B]">
              <div
                className="absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage:
                    "linear-gradient(#1D2126 1px, transparent 1px), linear-gradient(90deg, #1D2126 1px, transparent 1px)",
                  backgroundSize: "28px 28px",
                }}
              />
              <Video size={22} className="relative text-[#3A3F45]" strokeWidth={1.5} />
            </div>
            <div className="flex items-center justify-between border-t border-line px-3.5 py-2 font-mono text-[10.5px] text-dim2">
              <span>Placeholder — no stream endpoint yet</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
