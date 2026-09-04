import { useState } from "react";
import { Cpu, Sliders, CheckCircle2 } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";

const MODELS = [
  {
    id: "yolo",
    name: "YOLOv8s Tactical Edge",
    task: "Real-Time Object Detection",
    arch: "CSPDarknet + PANet FPN",
    params: "11.2M FP16",
    latency: "14.2 ms",
    fps: "70.4 FPS",
    mAP: "44.9% mAP@50-95",
    targetHardware: "NVIDIA Jetson AGX Orin / TensorRT INT8",
    color: "amber",
  },
  {
    id: "bytetrack",
    name: "ByteTrack Multi-Object Tracker",
    task: "Occlusion-Robust Trajectory Linkage",
    arch: "Kalman Filter + Low-Score Association",
    params: "Lightweight CPU",
    latency: "2.1 ms",
    fps: "476.0 FPS",
    mAP: "78.4% MOTA (Zero ID Swaps)",
    targetHardware: "Edge CPU / ARM Cortex-A78AE",
    color: "blue",
  },
  {
    id: "osnet",
    name: "OSNet-IBVAP Omni-Scale Re-ID",
    task: "Cross-Camera Appearance Embedding",
    arch: "Multi-Scale Residual Bottleneck 512-d",
    params: "2.2M FP16",
    latency: "18.5 ms",
    fps: "54.1 FPS",
    mAP: "91.2% Rank-1 Accuracy",
    targetHardware: "NVIDIA Tensor Core / DLA",
    color: "purple",
  },
  {
    id: "merkle",
    name: "SHA-256 Merkle Ledger Engine",
    task: "Cryptographic Evidence Anchor",
    arch: "NIST FIPS 180-4 Merkle Tree",
    params: "Hardware Accelerated",
    latency: "0.4 ms",
    fps: "2500 ops/sec",
    mAP: "100% Tamper Verification",
    targetHardware: "Cryptographic Engine / TPM 2.0",
    color: "green",
  },
];

export default function ModelZooPanel() {
  const [reidThreshold, setReidThreshold] = useState(0.80);
  const [nmsThreshold, setNmsThreshold] = useState(0.45);
  const [dwellLimit, setDwellLimit] = useState(240);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="AI Model Zoo & Neural Architecture Benchmarks"
        sub="Quantized edge-optimized deep learning inference pipeline for multi-camera border surveillance."
      />

      {/* Model Spec Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODELS.map((m) => (
          <div key={m.id} className="rounded-[4px] border border-line bg-panel p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-2 font-medium text-[13.5px]">
                  <Cpu size={15} className="text-amberLight" />
                  {m.name}
                </div>
                <span className="rounded-[2px] border border-line px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-dim">
                  {m.task.split(" ")[0]}
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-1.5 font-mono text-[11px] text-dim">
                <div className="flex justify-between">
                  <span>Task:</span>
                  <span className="text-ink">{m.task}</span>
                </div>
                <div className="flex justify-between">
                  <span>Architecture:</span>
                  <span className="text-ink">{m.arch}</span>
                </div>
                <div className="flex justify-between">
                  <span>Parameters / Precision:</span>
                  <span className="text-ink">{m.params}</span>
                </div>
                <div className="flex justify-between">
                  <span>Target Hardware:</span>
                  <span className="text-ink2">{m.targetHardware}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 font-mono text-[11px]">
              <div className="rounded-[3px] border border-line bg-panel2 p-2">
                <div className="text-[9.5px] text-dim2">INFERENCE LATENCY</div>
                <div className="text-[13px] font-bold text-amberLight">{m.latency} ({m.fps})</div>
              </div>
              <div className="rounded-[3px] border border-line bg-panel2 p-2">
                <div className="text-[9.5px] text-dim2">ACCURACY / SCORE</div>
                <div className="text-[13px] font-bold text-green">{m.mAP}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Real-Time Sensitivity & Threshold Tuner */}
      <div className="rounded-[4px] border border-line bg-panel p-4">
        <div className="flex items-center justify-between border-b border-line pb-2.5">
          <div className="flex items-center gap-2 font-medium text-[13px]">
            <Sliders size={15} className="text-amberLight" />
            Active Edge Calibration & Threshold Matrices
          </div>
          {saved && (
            <span className="flex items-center gap-1 font-mono text-[11px] text-green">
              <CheckCircle2 size={12} /> Saved to Node Cache
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5 font-mono text-[11.5px]">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-dim">
              <span>Re-ID Cosine Threshold (tau):</span>
              <span className="font-bold text-amberLight">{reidThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="0.95"
              step="0.05"
              value={reidThreshold}
              onChange={(e) => setReidThreshold(parseFloat(e.target.value))}
              className="accent-amber"
            />
            <span className="text-[9.5px] text-dim2">Restricts gallery matches to strict appearance vectors.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-dim">
              <span>YOLOv8 NMS IoU Filter:</span>
              <span className="font-bold text-amberLight">{nmsThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="0.8"
              step="0.05"
              value={nmsThreshold}
              onChange={(e) => setNmsThreshold(parseFloat(e.target.value))}
              className="accent-amber"
            />
            <span className="text-[9.5px] text-dim2">Suppresses overlapping detection bounding boxes.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-dim">
              <span>Loitering Dwell Trigger:</span>
              <span className="font-bold text-amberLight">{dwellLimit}s</span>
            </div>
            <input
              type="range"
              min="60"
              max="600"
              step="30"
              value={dwellLimit}
              onChange={(e) => setDwellLimit(parseInt(e.target.value))}
              className="accent-amber"
            />
            <span className="text-[9.5px] text-dim2">Seconds target can linger before alert escalates.</span>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            className="rounded-[3px] border border-amber/40 bg-amber/15 px-4 py-1.5 font-medium text-[11.5px] text-amberLight transition-colors hover:bg-amber/25"
          >
            Apply Edge Calibration
          </button>
        </div>
      </div>
    </div>
  );
}
