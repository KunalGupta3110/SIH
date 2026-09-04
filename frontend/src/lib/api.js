// Thin wrapper around backend/main.py (run via `python run_ecosystem.py`,
// served on http://localhost:8000). Every function here maps 1:1 to an
// endpoint documented in that file — see backend/main.py for the exact
// response shape each one returns.
//
// Override the base URL with a .env file: VITE_API_BASE=http://<host>:8000

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res.json();
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
  silenceSiren: () => request("/siren/silence", { method: "POST" }),
};

export default api;
