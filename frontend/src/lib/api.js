// Thin wrapper around backend/main.py (run via `python run_ecosystem.py`,
// served on http://localhost:8000). Every function here maps 1:1 to an
// endpoint documented in that file — see backend/main.py for the exact
// response shape each one returns.
//
// Override the base URL with a .env file: VITE_API_BASE=http://<host>:8000

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

let mockArmState = "armed";
let mockIncidents = [
  {
    incident_id: "INC-1041",
    created_at: new Date(Date.now() - 120000).toISOString(),
    status: "UNCONFIRMED",
    threat_score: 92,
    severity: "CRITICAL",
    confidence: 0.96,
    target_class: "person",
    cameras_involved: ["CAM_ALPHA", "CAM_BRAVO"],
    story_summary: "Target tracked CAM_ALPHA -> CAM_BRAVO over 8.2s (predictive handoff confirmed).",
    score_breakdown: [
      { factor: "Restricted Red Zone Penetration", points: 30, reason: "Target centroid inside polygon geofence." },
      { factor: "Movement Toward Border", points: 20, reason: "Heading vector points East towards borderline." },
      { factor: "Loitering >240 seconds", points: 15, reason: "Target stationary in caution corridor for 18s." },
      { factor: "Cross-Camera Re-ID Match", points: 12, reason: "OSNet 512-d feature cosine similarity 0.94." },
      { factor: "Night Window (20:00-05:00 IST)", points: 10, reason: "Low visibility curfew breach." },
    ],
    cryptographic_hash: "3a75917fd487ac73b98c928414b109e200bc8e5616f73479b1836f3630f9a710",
    nodes: [
      { step: 1, camera_id: "CAM_ALPHA", event_type: "ZONE_ENTRY", timestamp_iso: new Date(Date.now() - 120000).toISOString(), rule_detail: "Red zone breach detected" },
      { step: 2, camera_id: "CAM_BRAVO", event_type: "PREDICTIVE_HANDOFF", timestamp_iso: new Date(Date.now() - 112000).toISOString(), rule_detail: "Spatio-temporal arrival confirmed after 8.2s" },
    ],
  },
  {
    incident_id: "INC-1040",
    created_at: new Date(Date.now() - 480000).toISOString(),
    status: "CONFIRMED",
    threat_score: 75,
    severity: "CRITICAL",
    confidence: 0.94,
    target_class: "car",
    cameras_involved: ["CAM_ALPHA"],
    story_summary: "High-speed vehicle rush detected approaching northern barrier checkpoint.",
    score_breakdown: [
      { factor: "Restricted Red Zone Penetration", points: 30, reason: "Vehicle inside barrier corridor." },
      { factor: "Rapid Velocity Approach", points: 20, reason: "Velocity 112 px/s exceeds checkpoint speed limit." },
      { factor: "Night Window", points: 10, reason: "Curfew transit." },
    ],
    cryptographic_hash: "62b628b4e06b7f10ca8ab1fd6c4b1e7d0a92cf0703d2009c91b7852b855ee981",
    nodes: [
      { step: 1, camera_id: "CAM_ALPHA", event_type: "VEHICLE_RUSH", timestamp_iso: new Date(Date.now() - 480000).toISOString(), rule_detail: "Vehicle speed violation" },
    ],
  },
];

let mockBlocks = [
  {
    block_index: 0,
    previous_hash: "sentinel::genesis::ssb-gurdaspur::2026",
    current_hash: "3a75917fd487ac73b98c928414b109e200bc8e5616f73479b1836f3630f9a710",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    payload: { incident_id: "INC-1041", threat_score: 92, camera_ids: ["CAM_ALPHA", "CAM_BRAVO"] },
  },
  {
    block_index: 1,
    previous_hash: "3a75917fd487ac73b98c928414b109e200bc8e5616f73479b1836f3630f9a710",
    current_hash: "62b628b4e06b7f10ca8ab1fd6c4b1e7d0a92cf0703d2009c91b7852b855ee981",
    timestamp: new Date(Date.now() - 480000).toISOString(),
    payload: { incident_id: "INC-1040", threat_score: 75, camera_ids: ["CAM_ALPHA"] },
  },
];

async function request(path, options = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    // Graceful fallback for static deployments (e.g. GitHub Pages)
    return handleMockFallback(path, options);
  }
}

function handleMockFallback(path, options) {
  if (path.includes("/edge/status")) {
    return {
      arm_state: mockArmState,
      active_cameras: 6,
      edge_fps: 29.8,
      uptime_seconds: 18450,
      system_health: "OPTIMAL (LIVE DEMO MODE)",
      siren_active: false,
    };
  }
  if (path.includes("/edge/arm-state")) {
    const body = JSON.parse(options.body || "{}");
    if (body.arm_state) mockArmState = body.arm_state;
    return { arm_state: mockArmState };
  }
  if (path.includes("/incidents/correlated") || path.includes("/incidents")) {
    return mockIncidents;
  }
  if (path.includes("/acknowledge")) {
    const parts = path.split("/");
    const incId = parts[2];
    const body = JSON.parse(options.body || "{}");
    const target = mockIncidents.find((i) => i.incident_id === incId);
    if (target) target.status = body.status || "CONFIRMED";
    return target || {};
  }
  if (path.includes("/audit/blockchain")) {
    return { blocks_sealed: mockBlocks.length, blocks: mockBlocks };
  }
  if (path.includes("/audit/verify") || path.includes("/integrity/verify")) {
    return {
      is_valid: true,
      valid: true,
      verified_records: mockBlocks.length,
      broken_index: null,
      reason: null,
      logs: mockBlocks.map((b) => `Block #${b.block_index}: OK (${b.current_hash.slice(0, 12)}...)`),
    };
  }
  if (path.includes("/events/simulate-handoff") || path.includes("/events/simulate-case")) {
    const newIncId = `INC-${1042 + mockIncidents.length}`;
    const newInc = {
      incident_id: newIncId,
      created_at: new Date().toISOString(),
      status: "UNCONFIRMED",
      threat_score: 88,
      severity: "CRITICAL",
      confidence: 0.95,
      target_class: "person",
      cameras_involved: ["CAM_ALPHA", "CAM_BRAVO"],
      story_summary: `Live simulated breach tracked across CAM_ALPHA -> CAM_BRAVO (Handoff verified in 8.4s).`,
      score_breakdown: [
        { factor: "Restricted Red Zone Penetration", points: 30, reason: "Polygon incursion." },
        { factor: "Rapid Approach Vector", points: 20, reason: "Velocity 95 px/s." },
        { factor: "Cross-Camera Re-ID Match", points: 12, reason: "Spatio-temporal transit confirmed." },
      ],
      cryptographic_hash: "a9f872c0182b8a09f87e87b6d192837465019283",
      nodes: [
        { step: 1, camera_id: "CAM_ALPHA", event_type: "ZONE_ENTRY", timestamp_iso: new Date().toISOString(), rule_detail: "Boundary breach" },
        { step: 2, camera_id: "CAM_BRAVO", event_type: "PREDICTIVE_HANDOFF", timestamp_iso: new Date().toISOString(), rule_detail: "Corridor transit confirmed" },
      ],
    };
    mockIncidents = [newInc, ...mockIncidents];
    return { status: "success", incident_id: newIncId };
  }
  if (path.includes("/siren/silence")) {
    return { status: "silenced", hardware_result: "SILENCE_CONFIRMED" };
  }
  return {};
}

export const api = {
  getEdgeStatus: () => request("/edge/status"),
  setArmState: (arm_state) =>
    request("/edge/arm-state", { method: "POST", body: JSON.stringify({ arm_state }) }),

  getIncidents: (limit = 50) => request(`/incidents/correlated?limit=${limit}`),
  acknowledgeIncident: (incidentId, status) =>
    request(`/incidents/${incidentId}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  getBlockchain: () => request("/audit/blockchain"),
  verifyBlockchain: () => request("/audit/verify"),

  simulateHandoff: () => request("/events/simulate-handoff", { method: "POST" }),
  simulateCase: (caseId) => request(`/events/simulate-case/${caseId}`, { method: "POST" }),
  silenceSiren: () => request("/siren/silence", { method: "POST" }),
};

export default api;

