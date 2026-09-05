// Thin wrapper around backend/main.py.
// Supports all live endpoints with fallback for static/offline preview.
//
// BASE defaults to the page's own origin (not a hardcoded "localhost:8000")
// so this works whether the console is opened as localhost, 127.0.0.1, a
// LAN IP, or a different port — backend/main.py serves this same build at
// /console, so same-origin is always correct unless VITE_API_BASE says
// otherwise (e.g. `npm run dev` pointed at a separately-running backend).
const BASE = import.meta.env.VITE_API_BASE || window.location.origin;

let mockArmState = "armed";
let mockNetworkDown = false;
let mockQueuedCount = 0;
let mockCameraHealth = [
  { camera_id: "CAM_ALPHA", status: "ONLINE", seconds_since_heartbeat: 4.2, simulated_fault: false },
  { camera_id: "CAM_BRAVO", status: "ONLINE", seconds_since_heartbeat: 8.5, simulated_fault: false },
  { camera_id: "CAM_CHARLIE", status: "ONLINE", seconds_since_heartbeat: 12.1, simulated_fault: false },
  { camera_id: "CAM_DELTA", status: "ONLINE", seconds_since_heartbeat: 15.0, simulated_fault: false },
];
let mockCalibration = {
  total_dismissed: 4,
  by_reason: { vegetation: 2, animal: 1, camera_noise: 1, weather: 0, other: 0 },
};

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
    story_summary: "Target tracked CAM_ALPHA -> CAM_BRAVO (expected CAM_BRAVO arrival in 6.0–14.0s, confirmed at 8.2s).",
    score_breakdown: [
      { factor: "Restricted Red Zone Penetration", points: 30, reason: "Target centroid inside polygon geofence." },
      { factor: "Movement Toward Border", points: 20, reason: "Heading vector points East towards borderline." },
      { factor: "Loitering >240 seconds", points: 15, reason: "Target stationary in caution corridor for 18s." },
      { factor: "Cross-Camera Re-ID Match", points: 12, reason: "Appearance matched across camera topology within predicted spatio-temporal transit window (6.0–14.0s)." },
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
      system_health: "OPTIMAL",
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
    if (target) {
      target.status = body.status || "CONFIRMED";
      if (body.dismiss_reason) {
        target.dismiss_reason = body.dismiss_reason;
        mockCalibration.total_dismissed += 1;
        mockCalibration.by_reason[body.dismiss_reason] = (mockCalibration.by_reason[body.dismiss_reason] || 0) + 1;
      }
    }
    return target || {};
  }
  if (path.includes("/calibration")) {
    return mockCalibration;
  }
  if (path.includes("/cameras/health")) {
    return { count: mockCameraHealth.length, cameras: mockCameraHealth };
  }
  if (path.includes("/simulate-fault")) {
    const camId = path.split("/")[2];
    const cam = mockCameraHealth.find((c) => c.camera_id === camId);
    if (cam) {
      cam.status = "FAULT";
      cam.simulated_fault = true;
    }
    return { camera_id: camId, status: "FAULT", message: "Simulated camera fault active." };
  }
  if (path.includes("/clear-fault")) {
    const camId = path.split("/")[2];
    const cam = mockCameraHealth.find((c) => c.camera_id === camId);
    if (cam) {
      cam.status = "ONLINE";
      cam.simulated_fault = false;
    }
    return { camera_id: camId, status: "ONLINE", message: "Simulated fault cleared." };
  }
  if (path.includes("/network/status")) {
    return {
      simulated_down: mockNetworkDown,
      status: mockNetworkDown ? "OFFLINE_BUFFERING" : "ONLINE_SYNCED",
      queued_events_count: mockQueuedCount,
      message: mockNetworkDown ? "Network down. Events queued locally." : "Network healthy.",
    };
  }
  if (path.includes("/network/toggle")) {
    mockNetworkDown = !mockNetworkDown;
    const drained = !mockNetworkDown ? mockQueuedCount : 0;
    if (!mockNetworkDown) mockQueuedCount = 0;
    return {
      simulated_down: mockNetworkDown,
      status: mockNetworkDown ? "OFFLINE_BUFFERING" : "ONLINE_SYNCED",
      drained_events: drained,
      queued_events_count: mockQueuedCount,
      message: mockNetworkDown ? "Simulated network failure. Buffering." : `Reconnected. Drained ${drained} events.`,
    };
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
      story_summary: `Target tracked CAM_ALPHA -> CAM_BRAVO (expected CAM_BRAVO arrival in 6.0–14.0s, confirmed at 8.5s).`,
      score_breakdown: [
        { factor: "Restricted Red Zone Penetration", points: 30, reason: "Polygon incursion." },
        { factor: "Rapid Approach Vector", points: 20, reason: "Velocity 95 px/s." },
        { factor: "Cross-Camera Re-ID Match", points: 12, reason: "Appearance matched within predicted spatio-temporal transit window (6.0–14.0s)." },
      ],
      cryptographic_hash: "a9f872c0182b8a09f87e87b6d192837465019283",
      nodes: [
        { step: 1, camera_id: "CAM_ALPHA", event_type: "ZONE_ENTRY", timestamp_iso: new Date().toISOString(), rule_detail: "Boundary breach" },
        { step: 2, camera_id: "CAM_BRAVO", event_type: "PREDICTIVE_HANDOFF", timestamp_iso: new Date().toISOString(), rule_detail: "Transit window confirmed" },
      ],
    };
    mockIncidents = [newInc, ...mockIncidents];
    return {
      status: "recorded",
      incident_id: newIncId,
      predicted_window_min_s: 6.0,
      predicted_window_max_s: 14.0,
      actual_transit_s: 8.5,
      handoff_confirmed: true,
    };
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
  acknowledgeIncident: (incidentId, status, dismiss_reason = null) =>
    request(`/incidents/${incidentId}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ status, dismiss_reason }),
    }),

  getCalibration: (cameraId = "") => request(cameraId ? `/calibration/${cameraId}` : "/calibration"),
  getCameraHealth: () => request("/cameras/health"),
  simulateCameraFault: (cameraId) => request(`/cameras/${cameraId}/simulate-fault`, { method: "POST" }),
  clearCameraFault: (cameraId) => request(`/cameras/${cameraId}/clear-fault`, { method: "POST" }),

  getNetworkStatus: () => request("/network/status"),
  toggleNetwork: () => request("/network/toggle", { method: "POST" }),

  getBlockchain: () => request("/audit/blockchain"),
  verifyBlockchain: () => request("/audit/verify"),

  simulateHandoff: () => request("/events/simulate-handoff", { method: "POST" }),
  simulateCase: (caseId) => request(`/events/simulate-case/${caseId}`, { method: "POST" }),
  silenceSiren: () => request("/siren/silence", { method: "POST" }),
};

export default api;
