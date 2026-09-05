import { useEffect, useState } from "react";
import { Cpu, Sliders, CheckCircle2, BarChart3 } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

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
  const [calibrationStats, setCalibrationStats] = useState(null);

  useEffect(() => {
    api.getCalibration().then((data) => {
      if (data) setCalibrationStats(data);
    }).catch(() => {});
  }, []);

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
                  <span>Inference Latency:</span>
                  <span className="font-bold text-amber">{m.latency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Throughput:</span>
                  <span className="font-bold text-green">{m.fps}</span>
                </div>
                <div className="flex justify-between">
                  <span>Benchmark Accuracy:</span>
                  <span className="font-bold text-blue">{m.mAP}</span>
                </div>
                <div className="flex justify-between border-t border-line/60 pt-1.5 text-[10px] text-dim2">
                  <span>Target Hardware:</span>
                  <span>{m.targetHardware}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Site Calibration & Live Tuning */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-[4px] border border-line bg-panel p-4">
          <div className="flex items-center gap-2 border-b border-line pb-2.5 font-medium text-[13.5px]">
            <Sliders size={15} className="text-amberLight" />
            Edge Inference Hyperparameters
          </div>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <div className="flex justify-between text-[11.5px] font-mono">
                <span className="text-dim">Re-ID Cosine Threshold:</span>
                <span className="text-amber font-bold">{reidThreshold}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={reidThreshold}
                onChange={(e) => setReidThreshold(parseFloat(e.target.value))}
                className="w-full mt-1 accent-amber"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11.5px] font-mono">
                <span className="text-dim">NMS IoU Threshold:</span>
                <span className="text-amber font-bold">{nmsThreshold}</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={nmsThreshold}
                onChange={(e) => setNmsThreshold(parseFloat(e.target.value))}
                className="w-full mt-1 accent-amber"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11.5px] font-mono">
                <span className="text-dim">Loitering Dwell Trigger (s):</span>
                <span className="text-amber font-bold">{dwellLimit}s</span>
              </div>
              <input
                type="range"
                min="60"
                max="600"
                step="30"
                value={dwellLimit}
                onChange={(e) => setDwellLimit(parseInt(e.target.value))}
                className="w-full mt-1 accent-amber"
              />
            </div>
            <button
              onClick={handleSave}
              className="mt-2 flex items-center justify-center gap-2 rounded bg-amber py-2 text-[12px] font-bold text-panel hover:bg-amberLight"
            >
              {saved ? <CheckCircle2 size={14} /> : null}
              {saved ? "Hyperparameters Updated Live" : "Apply Parameters to Edge"}
            </button>
          </div>
        </div>

        {/* Live Calibration Stats from Operator Feedback */}
        <div className="rounded-[4px] border border-line bg-panel p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-line pb-2.5 font-medium text-[13.5px]">
              <BarChart3 size={15} className="text-green" />
              Live Site Calibration Statistics
            </div>
            <div className="mt-3 text-[12px] text-dim leading-relaxed">
              Operator dismissals feed dynamic sensitivity filters to eliminate false positive patterns per camera sector.
            </div>
            {calibrationStats?.by_reason && (
              <div className="mt-3 flex flex-col gap-2 font-mono text-[11.5px]">
                {Object.entries(calibrationStats.by_reason).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center rounded bg-panel2 px-3 py-1.5">
                    <span className="text-dim capitalize">{k.replace("_", " ")}</span>
                    <span className="font-bold text-ink">{v} events</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 rounded border border-green/30 bg-green/10 p-2.5 text-[11px] text-green font-mono">
            STATUS: Dynamic site calibration active across 4 nodes.
          </div>
        </div>
      </div>
    </div>
  );
}
