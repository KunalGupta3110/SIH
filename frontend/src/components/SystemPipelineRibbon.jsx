import { useState, useEffect } from "react";
import {
  Camera,
  Scan,
  GitCommit,
  Activity,
  ArrowRightLeft,
  Layers,
  ShieldAlert,
  Archive,
  FileCheck2,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";

export const PIPELINE_STAGES = [
  {
    id: "input",
    step: "01",
    shortLabel: "CAMERA INPUT",
    label: "Camera Input",
    tech: "4K Optical + FLIR LWIR",
    description: "Multi-sensor border watchtower optical & thermal feeds at 30 FPS.",
    icon: Camera,
  },
  {
    id: "detection",
    step: "02",
    shortLabel: "OBJECT DETECTION",
    label: "Edge Neural Detection",
    tech: "YOLOv8s INT8 TensorRT",
    description: "Hardware-accelerated real-time bounding box & class inference on Jetson Orin.",
    icon: Scan,
  },
  {
    id: "tracking",
    step: "03",
    shortLabel: "TRACKING",
    label: "Persistent Tracking",
    tech: "ByteTrack Kinematics",
    description: "Kalman-filtered centroid vectors maintaining unique track IDs through brief occlusion.",
    icon: GitCommit,
  },
  {
    id: "behaviour",
    step: "04",
    shortLabel: "BEHAVIOUR ANALYSIS",
    label: "Spatial Behaviour",
    tech: "Geofence & Bearing Vectors",
    description: "Automated flagging for 100m restricted red-zone incursion, loitering, and velocity.",
    icon: Activity,
  },
  {
    id: "handoff",
    step: "05",
    shortLabel: "PREDICTIVE HANDOFF",
    label: "Predictive Handoff",
    tech: "Graph Topology + ETA Engine",
    description: "Evaluates camera transit distances & exit angles to forecast next camera intercept.",
    icon: ArrowRightLeft,
  },
  {
    id: "correlation",
    step: "06",
    shortLabel: "INCIDENT CORRELATION",
    label: "Multi-Camera Correlation",
    tech: "Spatio-Temporal Debounce",
    description: "Aggregates multi-camera detections into ONE unified chronological incident.",
    icon: Layers,
  },
  {
    id: "scoring",
    step: "07",
    shortLabel: "THREAT SCORING",
    label: "Explainable Threat Score",
    tech: "Deterministic Rulebook",
    description: "Transparent point contributions (+30 zone, +20 border vector, +12 Re-ID).",
    icon: ShieldAlert,
  },
  {
    id: "capsule",
    step: "08",
    shortLabel: "EVIDENCE CAPSULE",
    label: "Evidence Capsule",
    tech: "Self-Contained Envelope",
    description: "Seals target snapshots, trajectories, observations, and telemetry into an immutable bundle.",
    icon: Archive,
  },
  {
    id: "verify",
    step: "09",
    shortLabel: "INTEGRITY VERIFY",
    label: "Section 65B Audit",
    tech: "Canonical SHA-256 Ledger",
    description: "Cryptographic hash chaining ensures zero tampering for Indian Evidence Act admissibility.",
    icon: FileCheck2,
  },
];

export default function SystemPipelineRibbon({
  activeStageIndex = 4,
  onSelectStage,
  onRunDemo,
}) {
  const [selectedStage, setSelectedStage] = useState(activeStageIndex);
  const [isCycling, setIsCycling] = useState(false);

  useEffect(() => {
    setSelectedStage(activeStageIndex);
  }, [activeStageIndex]);

  const handleRunFullPipeline = () => {
    if (isCycling) return;
    setIsCycling(true);
    let stage = 0;
    setSelectedStage(0);
    onSelectStage?.(0);

    const interval = setInterval(() => {
      stage += 1;
      if (stage < PIPELINE_STAGES.length) {
        setSelectedStage(stage);
        onSelectStage?.(stage);
      } else {
        clearInterval(interval);
        setIsCycling(false);
        onRunDemo?.();
      }
    }, 750);
  };

  const currentInfo = PIPELINE_STAGES[selectedStage] || PIPELINE_STAGES[4];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-sky-500/30 bg-gradient-to-r from-[#030812] via-[#050f1c] to-[#030812] p-4 sm:p-5 shadow-2xl font-mono">
      {/* Ribbon Topline: Title & Pipeline Controller */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.25)]">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-white tracking-wider">
                END-TO-END INTELLIGENCE PIPELINE
              </span>
              <span className="rounded bg-sky-500/15 px-2 py-0.2 text-[9.5px] font-bold text-sky-300 border border-sky-500/30">
                OBSERVE ➔ CORRELATE ➔ PREDICT ➔ RECONSTRUCT ➔ VERIFY
              </span>
            </div>
            <div className="text-[10.5px] text-slate-400">
              Deterministic 9-stage architecture from optical photon capture to court-sealed cryptographic evidence.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRunFullPipeline}
            disabled={isCycling}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-sky-500/30 hover:border-sky-400 transition-all shadow-[0_0_15px_rgba(56,189,248,0.15)] active:scale-95 disabled:opacity-50"
          >
            <Play size={12} fill="currentColor" className={isCycling ? "animate-spin" : ""} />
            <span>{isCycling ? "STEPPING PIPELINE..." : "RUN PIPELINE DEMO"}</span>
          </button>
        </div>
      </div>

      {/* 9-Stage Pipeline Horizontal Scroller / Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5 pt-1">
        {PIPELINE_STAGES.map((st, idx) => {
          const isActive = idx === selectedStage;
          const Icon = st.icon;

          return (
            <button
              key={st.id}
              onClick={() => {
                setSelectedStage(idx);
                onSelectStage?.(idx);
              }}
              className={`group relative flex flex-col items-center text-center p-2.5 rounded-xl border transition-all ${
                isActive
                  ? "border-sky-400 bg-sky-950/50 shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/60"
                  : "border-white/10 bg-black/40 hover:border-white/20 hover:bg-black/70"
              }`}
            >
              {/* Step indicator */}
              <div className="flex items-center justify-between w-full text-[9px] text-slate-500 mb-1.5">
                <span className={isActive ? "text-sky-300 font-bold" : ""}>{st.step}</span>
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping" />}
              </div>

              {/* Stage Icon */}
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg border mb-1.5 transition-colors ${
                  isActive
                    ? "border-sky-400 bg-sky-500/20 text-sky-300"
                    : "border-white/10 bg-black/60 text-slate-400 group-hover:text-slate-200"
                }`}
              >
                <Icon size={14} />
              </div>

              {/* Label */}
              <div
                className={`text-[10.5px] font-bold tracking-tight line-clamp-1 leading-snug ${
                  isActive ? "text-white" : "text-slate-300"
                }`}
              >
                {st.shortLabel}
              </div>

              {/* Sub-tech pill */}
              <div className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">
                {st.tech.split(" ")[0]}
              </div>

              {/* Active bottom border accent */}
              {isActive && (
                <div className="absolute -bottom-1 left-2 right-2 h-0.5 bg-sky-400 rounded-full shadow-[0_0_8px_rgba(56,189,248,1)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Stage Intelligence Brief */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-[11px] text-slate-300">
        <div className="flex items-center gap-3">
          <span className="rounded bg-sky-500/20 border border-sky-500/40 px-2 py-0.5 font-bold text-sky-300 text-[10px]">
            STAGE {currentInfo.step} · {currentInfo.label.toUpperCase()}
          </span>
          <span className="text-slate-200 font-medium">{currentInfo.description}</span>
        </div>
        <div className="text-slate-400 text-[10px] shrink-0">
          CORE STACK: <span className="text-sky-300 font-bold">{currentInfo.tech}</span>
        </div>
      </div>
    </div>
  );
}
