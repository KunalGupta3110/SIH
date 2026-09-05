import { useState, useMemo } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  GitBranch,
  Layers,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  ShieldCheck,
  Navigation,
  Eye,
} from "lucide-react";
import api from "../lib/api.js";

// Topologically defined Camera Nodes with real geometric positions and transit edges
export const CAMERA_TOPOLOGY_NODES = {
  CAM_ALPHA: {
    id: "CAM_ALPHA",
    displayName: "CAM-01 (Checkpost Alpha)",
    sector: "Northern Crossing Sector",
    bearing: "025° NNE",
    status: "ONLINE",
    neighbors: {
      CAM_BRAVO: { direction: "EAST", bearingDeg: 78, distanceM: 26.3, baseMinTransitS: 6.0, baseMaxTransitS: 14.0 },
      CAM_DELTA: { direction: "SOUTH", bearingDeg: 185, distanceM: 35.0, baseMinTransitS: 8.0, baseMaxTransitS: 18.0 },
    },
  },
  CAM_BRAVO: {
    id: "CAM_BRAVO",
    displayName: "CAM-02 (BOP Bravo Perimeter)",
    sector: "Eastern Fenced Corridor",
    bearing: "018° NNE",
    status: "ONLINE",
    neighbors: {
      CAM_ALPHA: { direction: "WEST", bearingDeg: 258, distanceM: 26.3, baseMinTransitS: 6.0, baseMaxTransitS: 14.0 },
      CAM_CHARLIE: { direction: "EAST", bearingDeg: 82, distanceM: 48.0, baseMinTransitS: 10.0, baseMaxTransitS: 22.0 },
    },
  },
  CAM_CHARLIE: {
    id: "CAM_CHARLIE",
    displayName: "CAM-03 (Tower Charlie Culvert)",
    sector: "Ridge Watchpoint 7",
    bearing: "355° NNW",
    status: "ONLINE",
    neighbors: {
      CAM_BRAVO: { direction: "WEST", bearingDeg: 262, distanceM: 48.0, baseMinTransitS: 10.0, baseMaxTransitS: 22.0 },
    },
  },
  CAM_DELTA: {
    id: "CAM_DELTA",
    displayName: "CAM-04 (Riverine Sentry Delta)",
    sector: "Creek Sector 2",
    bearing: "012° N",
    status: "ONLINE",
    neighbors: {
      CAM_ALPHA: { direction: "NORTH", bearingDeg: 5, distanceM: 35.0, baseMinTransitS: 8.0, baseMaxTransitS: 18.0 },
    },
  },
};

export default function PredictiveHandoffCard({ onHandoffSimulated, onResetDemo }) {
  const [selectedSource, setSelectedSource] = useState("CAM_ALPHA");
  const [selectedDirection, setSelectedDirection] = useState("EAST");
  const [velocityMps, setVelocityMps] = useState(1.8);
  const [isSimulating, setIsSimulating] = useState(false);
  const [handoffState, setHandoffState] = useState("CONFIRMED"); // 'IDLE' | 'COMPUTING' | 'CONFIRMED'
  const [feedback, setFeedback] = useState(null);

  // Dynamic topological evaluation based on graph geometry
  const calculation = useMemo(() => {
    const sourceNode = CAMERA_TOPOLOGY_NODES[selectedSource] || CAMERA_TOPOLOGY_NODES.CAM_ALPHA;
    const neighbors = sourceNode.neighbors;

    // Search neighbors matching selected general heading
    let candidateEntries = Object.entries(neighbors);
    let bestMatch = candidateEntries.find(
      ([, meta]) => meta.direction.toUpperCase() === selectedDirection.toUpperCase()
    );

    if (!bestMatch && candidateEntries.length > 0) {
      bestMatch = candidateEntries[0]; // fallback closest neighbor
    }

    const targetCamId = bestMatch ? bestMatch[0] : "CAM_BRAVO";
    const targetMeta = bestMatch ? bestMatch[1] : { distanceM: 26.3, baseMinTransitS: 6.0, baseMaxTransitS: 14.0, bearingDeg: 78 };
    const targetNode = CAMERA_TOPOLOGY_NODES[targetCamId] || CAMERA_TOPOLOGY_NODES.CAM_BRAVO;

    // Speed scaling: 1.5 m/s is nominal walk = 1.0x factor
    const speedFactor = Math.max(0.4, Math.min(2.8, velocityMps / 1.5));
    const transitMinS = Number((targetMeta.baseMinTransitS / speedFactor).toFixed(1));
    const transitMaxS = Number((targetMeta.baseMaxTransitS / speedFactor).toFixed(1));
    const estimatedArrivalS = Number((targetMeta.distanceM / velocityMps).toFixed(1));

    // Candidate restriction evaluation
    const candidateEvaluations = candidateEntries.map(([camId, meta]) => {
      const isSelected = camId === targetCamId;
      return {
        cameraId: camId,
        direction: meta.direction,
        distanceM: meta.distanceM,
        bearing: `${meta.bearingDeg}°`,
        status: isSelected ? "SELECTED" : "REJECTED",
        reason: isSelected
          ? `Trajectory vector matches exit corridor (${meta.direction})`
          : `Angular deviation > 90° from trajectory vector`,
      };
    });

    return {
      sourceId: sourceNode.id,
      sourceName: sourceNode.displayName,
      trackId: "TRACK P17",
      targetClass: "Person [Infiltrator]",
      direction: selectedDirection,
      velocity: `${velocityMps} m/s`,
      predictedId: targetNode.id,
      predictedName: targetNode.displayName,
      distanceM: targetMeta.distanceM,
      transitWindow: `${transitMinS}s – ${transitMaxS}s`,
      estimatedArrivalS,
      reidScore: "94.2%",
      reidRank: "Rank-1 Cosine Appearance Match",
      candidateEvaluations,
    };
  }, [selectedSource, selectedDirection, velocityMps]);

  const handleSimulateClick = async () => {
    setIsSimulating(true);
    setHandoffState("COMPUTING");
    setFeedback({
      type: "computing",
      message: `Calculating topological handoff from ${calculation.sourceId} along ${selectedDirection} vector...`,
    });

    try {
      await api.simulateHandoff();
      setTimeout(() => {
        setHandoffState("CONFIRMED");
        setIsSimulating(false);
        setFeedback({
          type: "success",
          message: `Handoff confirmed: Target re-acquired at ${calculation.predictedId} within predicted window (${calculation.estimatedArrivalS}s). Re-ID match 94.2%.`,
        });
        onHandoffSimulated?.();
        setTimeout(() => setFeedback(null), 5000);
      }, 900);
    } catch (e) {
      console.error(e);
      setIsSimulating(false);
      setHandoffState("CONFIRMED");
    }
  };

  const handleResetClick = () => {
    api.resetDemo();
    setSelectedSource("CAM_ALPHA");
    setSelectedDirection("EAST");
    setVelocityMps(1.8);
    setHandoffState("CONFIRMED");
    setFeedback({ type: "reset", message: "Demo scenario & camera topology state reset to default." });
    onResetDemo?.();
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-sky-500/30 bg-[#060e18] p-5 shadow-2xl font-mono text-slate-200">
      {/* ── TOP HEADER & BADGES ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.25)]">
            <GitBranch size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-white tracking-wider">
                PREDICTIVE CAMERA HANDOFF
              </span>
              <span className="rounded bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.2 text-[10px] font-bold text-emerald-300">
                TOPOLOGY ACTIVE
              </span>
              <span className="rounded bg-sky-500/15 border border-sky-500/30 px-2 py-0.2 text-[10px] text-sky-300">
                ◇ SIMULATION SCENARIO
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Spatial corridor transit forecasting using camera node graph, target kinematics, and appearance Re-ID.
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResetClick}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-white hover:border-white/25 transition-all"
            title="Reset scenario & topological parameters to default"
          >
            <RotateCcw size={12} />
            <span>RESET</span>
          </button>

          <button
            onClick={handleSimulateClick}
            disabled={isSimulating}
            className="flex items-center gap-2 rounded-lg border border-sky-500/60 bg-sky-500/20 px-4 py-1.5 text-[11.5px] font-bold text-sky-200 hover:bg-sky-500/30 hover:border-sky-400 transition-all shadow-[0_0_15px_rgba(56,189,248,0.2)] active:scale-95 disabled:opacity-50"
          >
            <Play size={12} fill="currentColor" className={isSimulating ? "animate-spin" : ""} />
            <span>{isSimulating ? "COMPUTING HANDOFF..." : "SIMULATE LIVE HANDOFF"}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-950/40 px-3.5 py-2 text-[11.5px] text-sky-200 animate-fadeIn">
          <Sparkles size={14} className="text-sky-400 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ── INTERACTIVE TOPOLOGY CONTROLS ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-white/10 bg-black/40 p-3 text-[11px]">
        {/* Source Camera Selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-slate-400">1. Source Camera Node</label>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="rounded border border-white/15 bg-black px-2.5 py-1.5 text-white focus:border-sky-400 focus:outline-none"
          >
            <option value="CAM_ALPHA">CAM_ALPHA — Checkpost Alpha Gate</option>
            <option value="CAM_BRAVO">CAM_BRAVO — BOP Bravo Perimeter</option>
            <option value="CAM_CHARLIE">CAM_CHARLIE — Tower Charlie Culvert</option>
            <option value="CAM_DELTA">CAM_DELTA — Riverine Sentry Delta</option>
          </select>
        </div>

        {/* Exit Direction Selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-slate-400">2. Exit Heading Vector</label>
          <select
            value={selectedDirection}
            onChange={(e) => setSelectedDirection(e.target.value)}
            className="rounded border border-white/15 bg-black px-2.5 py-1.5 text-white focus:border-sky-400 focus:outline-none"
          >
            <option value="EAST">EAST (078° ➔ BOP Bravo)</option>
            <option value="SOUTH">SOUTH (185° ➔ Creek Delta)</option>
            <option value="WEST">WEST (258° ➔ Checkpost Alpha)</option>
            <option value="NORTH">NORTH (005° ➔ Zero Line)</option>
          </select>
        </div>

        {/* Target Velocity */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="uppercase font-bold text-slate-400">3. Target Velocity</span>
            <span className="font-bold text-sky-400">{velocityMps} m/s ({Math.round(velocityMps * 60)} px/s)</span>
          </div>
          <input
            type="range"
            min="0.6"
            max="3.5"
            step="0.1"
            value={velocityMps}
            onChange={(e) => setVelocityMps(parseFloat(e.target.value))}
            className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-sky-400"
          />
          <div className="flex justify-between text-[9px] text-slate-500">
            <span>0.6 m/s (Crawl)</span>
            <span>1.8 m/s (Walk)</span>
            <span>3.5 m/s (Sprint)</span>
          </div>
        </div>
      </div>

      {/* ── THE MANDATED FIRST-CLASS HANDOFF PIPELINE DISPLAY ────────── */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5 items-stretch pt-1">
        {/* Step 1: SOURCE CAMERA */}
        <div className="rounded-xl border border-sky-500/30 bg-[#0a1522] p-3.5 flex flex-col justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>STEP 1</span>
            <span className="text-sky-400 font-bold">SOURCE</span>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1.5 text-white font-bold text-[13px]">
              <Camera size={14} className="text-sky-400" />
              <span>{calculation.sourceId}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{calculation.sourceName}</div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[9.5px] text-emerald-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>OPTICAL PTZ ACTIVE</span>
          </div>
        </div>

        {/* Step 2: TRACK & TARGET */}
        <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 flex flex-col justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>STEP 2</span>
            <span className="text-slate-300 font-bold">TARGET</span>
          </div>
          <div className="mt-2">
            <div className="font-bold text-white text-[13px]">{calculation.trackId}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{calculation.targetClass}</div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[9.5px] text-slate-400">
            Centroid Kalman active
          </div>
        </div>

        {/* Step 3: MOVEMENT DIRECTION & VELOCITY */}
        <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 flex flex-col justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>STEP 3</span>
            <span className="text-slate-300 font-bold">KINEMATICS</span>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1 font-bold text-amber-300 text-[12.5px]">
              <Compass size={13} />
              <span>{calculation.direction}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{calculation.velocity}</div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[9.5px] text-amber-400/80">
            Bearing vector 078° E
          </div>
        </div>

        {/* Step 4: PREDICTED NEXT CAMERA */}
        <div className="rounded-xl border border-sky-400 bg-sky-950/40 p-3.5 flex flex-col justify-between shadow-[0_0_15px_rgba(56,189,248,0.2)]">
          <div className="text-[9.5px] uppercase tracking-wider text-sky-300 flex items-center justify-between font-bold">
            <span>STEP 4</span>
            <span className="animate-pulse">PREDICTED</span>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1.5 text-white font-bold text-[13px]">
              <Camera size={14} className="text-sky-300" />
              <span>{calculation.predictedId}</span>
            </div>
            <div className="text-[10px] text-sky-200 mt-0.5">{calculation.predictedName}</div>
          </div>
          <div className="mt-3 pt-2 border-t border-sky-500/20 text-[9.5px] text-sky-300">
            Corridor: {calculation.distanceM}m gap
          </div>
        </div>

        {/* Step 5: CALCULATED ETA */}
        <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 flex flex-col justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>STEP 5</span>
            <span className="text-slate-300 font-bold">ETA WINDOW</span>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1 font-bold text-white text-[13.5px]">
              <Clock size={13} className="text-sky-400" />
              <span>{calculation.estimatedArrivalS}s</span>
            </div>
            <div className="text-[9.5px] text-slate-400 mt-0.5">Window: {calculation.transitWindow}</div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[9.5px] text-slate-400">
            Scaled by velocity
          </div>
        </div>

        {/* Step 6: RE-ID MATCH */}
        <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 flex flex-col justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>STEP 6</span>
            <span className="text-slate-300 font-bold">RE-ID EMBED</span>
          </div>
          <div className="mt-2">
            <div className="font-bold text-emerald-400 text-[13.5px]">{calculation.reidScore}</div>
            <div className="text-[9.5px] text-slate-400 mt-0.5 line-clamp-1">{calculation.reidRank}</div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[9.5px] text-emerald-400/80">
            Cosine feature match
          </div>
        </div>

        {/* Step 7: HANDOFF CONFIRMED */}
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3.5 flex flex-col justify-between">
          <div className="text-[9.5px] uppercase tracking-wider text-emerald-400 flex items-center justify-between font-bold">
            <span>STEP 7</span>
            <span>STATUS</span>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1.5 font-bold text-emerald-300 text-[12.5px]">
              <CheckCircle2 size={15} className="text-emerald-400 animate-pulse" />
              <span>✓ CONFIRMED</span>
            </div>
            <div className="text-[9.5px] text-emerald-200/80 mt-0.5">Arrival at {calculation.estimatedArrivalS}s</div>
          </div>
          <div className="mt-3 pt-2 border-t border-emerald-500/20 text-[9.5px] text-emerald-300">
            Chain linked to incident
          </div>
        </div>
      </div>

      {/* ── TOPOLOGICAL CANDIDATE CAMERA EVALUATION TABLE ──────────── */}
      <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 text-[11px] flex flex-col gap-2">
        <div className="flex items-center justify-between text-slate-400 text-[10.5px]">
          <span className="font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Layers size={13} className="text-sky-400" />
            <span>Topological Candidate Camera Restriction Check</span>
          </span>
          <span>SPATIAL GRAPH: 4 NODES · 4 CORRIDOR EDGES</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
          {calculation.candidateEvaluations.map((cand) => {
            const isSel = cand.status === "SELECTED";
            return (
              <div
                key={cand.cameraId}
                className={`rounded-lg border p-2.5 flex items-center justify-between ${
                  isSel
                    ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-200"
                    : "border-white/10 bg-black/40 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isSel ? "bg-emerald-400 animate-ping" : "bg-slate-600"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-[12px]">{cand.cameraId}</span>
                      <span className="text-[10px] text-slate-400">Bearing {cand.bearing} ({cand.direction})</span>
                      <span className="text-[10px] text-slate-400">· {cand.distanceM}m</span>
                    </div>
                    <div className="text-[10px] text-slate-300 mt-0.5">{cand.reason}</div>
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isSel ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300" : "bg-black/60 text-slate-500"
                  }`}
                >
                  {cand.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
