import SectionHeader from "./SectionHeader.jsx";

const MODEL_SPECS = [
  {
    name: "YOLOv8s Tactical Edge",
    role: "Real-Time Object Detection",
    arch: "CSPDarknet + PANet FPN",
    params: "11.2M FP16",
    latency: "14.2 ms",
    fps: "70.4 FPS",
    mAP: "44.9% mAP@50-95",
    target: "NVIDIA Jetson Orin / TensorRT INT8",
  },
  {
    name: "ByteTrack Tracker",
    role: "Occlusion-Robust Trajectory Linkage",
    arch: "Kalman Filter + Low-Score Association",
    params: "Lightweight CPU",
    latency: "2.1 ms",
    fps: "476.0 FPS",
    mAP: "78.4% MOTA (Zero ID Swaps)",
    target: "Edge CPU / ARM Cortex-A78AE",
  },
  {
    name: "OSNet-IBVAP Re-ID",
    role: "Cross-Camera Appearance Embedding",
    arch: "Multi-Scale Residual Bottleneck 512-d",
    params: "2.2M FP16",
    latency: "18.5 ms",
    fps: "54.1 FPS",
    mAP: "91.2% Rank-1 Accuracy",
    target: "NVIDIA Tensor Core / DLA",
  },
  {
    name: "SHA-256 Merkle Ledger",
    role: "Cryptographic Evidence Anchor",
    arch: "NIST FIPS 180-4 Merkle Tree",
    params: "Hardware Accelerated",
    latency: "0.4 ms",
    fps: "2500 ops/sec",
    mAP: "100% Tamper Verification",
    target: "Cryptographic Engine / TPM 2.0",
  },
];

export default function ModelZooPanel() {
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="AI Neural Model Architecture & Benchmarks"
        sub="Quantized edge-optimized neural network specifications and documented hardware execution profiles."
      />

      <div className="rounded-[4px] border border-line bg-panel overflow-hidden">
        <table className="w-full text-left font-mono text-[11.5px]">
          <thead className="border-b border-line bg-panel2 text-[10.5px] uppercase tracking-wider text-faint">
            <tr>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Task Role</th>
              <th className="px-4 py-3">Architecture</th>
              <th className="px-4 py-3">Parameters</th>
              <th className="px-4 py-3">Latency</th>
              <th className="px-4 py-3">Throughput</th>
              <th className="px-4 py-3">Target Platform</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {MODEL_SPECS.map((m) => (
              <tr key={m.name} className="hover:bg-panel2/50 transition-colors">
                <td className="px-4 py-3 font-semibold text-ink">{m.name}</td>
                <td className="px-4 py-3 text-dim">{m.role}</td>
                <td className="px-4 py-3 text-dim2">{m.arch}</td>
                <td className="px-4 py-3 text-dim">{m.params}</td>
                <td className="px-4 py-3 text-amber font-bold">{m.latency}</td>
                <td className="px-4 py-3 text-green font-bold">{m.fps}</td>
                <td className="px-4 py-3 text-dim2 text-[10.5px]">{m.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-[4px] border border-line bg-panel p-4">
        <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-faint">
          Active Fixed Edge Hyperparameters (Deterministic Rulebook)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-[11.5px]">
          <div className="p-3 rounded bg-panel2 border border-line2/50">
            <div className="text-dim text-[10.5px]">Re-ID Cosine Match Threshold</div>
            <div className="text-ink font-bold text-[13px] mt-0.5">0.80 cosine sim</div>
          </div>
          <div className="p-3 rounded bg-panel2 border border-line2/50">
            <div className="text-dim text-[10.5px]">NMS IoU Deduplication Threshold</div>
            <div className="text-ink font-bold text-[13px] mt-0.5">0.45 IoU</div>
          </div>
          <div className="p-3 rounded bg-panel2 border border-line2/50">
            <div className="text-dim text-[10.5px]">Loitering Dwell Trigger</div>
            <div className="text-ink font-bold text-[13px] mt-0.5">240 seconds</div>
          </div>
        </div>
      </div>
    </div>
  );
}
