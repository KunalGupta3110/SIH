import { useState } from "react";
import { Terminal, Play, RefreshCw } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

const ENDPOINTS = [
  {
    name: "Simulate Predictive Handoff",
    method: "POST",
    path: "/events/simulate-handoff",
    desc: "Triggers cross-camera CAM_ALPHA -> CAM_BRAVO handoff with topological transit window (6.0–14.0s).",
    action: () => api.simulateHandoff(),
  },
  {
    name: "Toggle Network Offline Buffer",
    method: "POST",
    path: "/network/toggle",
    desc: "Simulates intermittent frontier link loss; buffers events locally & auto-drains upon reconnection.",
    action: () => api.toggleNetwork(),
  },
  {
    name: "Verify Cryptographic Ledger",
    method: "GET",
    path: "/audit/verify",
    desc: "Validates entire SHA-256 Merkle hash chain from genesis block to current head.",
    action: () => api.verifyBlockchain(),
  },
  {
    name: "Inspect Camera Node Health",
    method: "GET",
    path: "/cameras/health",
    desc: "Queries real-time heartbeat states (ONLINE, STALE, OFFLINE, FAULT) for all border nodes.",
    action: () => api.getCameraHealth(),
  },
  {
    name: "Get Site Calibration Statistics",
    method: "GET",
    path: "/calibration",
    desc: "Returns breakdown of false-alarm dismissals by root cause for dynamic threshold tuning.",
    action: () => api.getCalibration(),
  },
  {
    name: "Query Edge System Telemetry",
    method: "GET",
    path: "/edge/status",
    desc: "Fetches system FPS, armed state, hardware simulation mode, and 24h event counter.",
    action: () => api.getEdgeStatus(),
  },
];

export default function ApiTestbenchPanel() {
  const [loadingIndex, setLoadingIndex] = useState(null);
  const [responseLog, setResponseLog] = useState(null);

  const executeEndpoint = async (ep, idx) => {
    setLoadingIndex(idx);
    const start = performance.now();
    try {
      const res = await ep.action();
      const elapsed = (performance.now() - start).toFixed(1);
      setResponseLog({
        endpoint: ep.name,
        method: ep.method,
        path: ep.path,
        status: "200 OK",
        latency: `${elapsed}ms`,
        data: res,
        timestamp: new Date().toLocaleTimeString("en-IN"),
      });
    } catch (e) {
      const elapsed = (performance.now() - start).toFixed(1);
      setResponseLog({
        endpoint: ep.name,
        method: ep.method,
        path: ep.path,
        status: "ERROR",
        latency: `${elapsed}ms`,
        data: { error: e.message },
        timestamp: new Date().toLocaleTimeString("en-IN"),
      });
    } finally {
      setLoadingIndex(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Interactive API Testbench & System Telemetry"
        sub="Test all live backend endpoints, inspect real-time response payloads, and audit system health directly within the unified console."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        {/* Endpoint Action List */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-1">
            Available Platform Operations
          </div>
          {ENDPOINTS.map((ep, idx) => (
            <div
              key={ep.path}
              className="rounded-[4px] border border-line bg-panel p-3.5 flex flex-col justify-between hover:border-line2 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        ep.method === "POST" ? "bg-amber/20 text-amber" : "bg-blue/20 text-blue"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="font-medium text-[13px] text-ink">{ep.name}</span>
                  </div>
                  <div className="font-mono text-[11px] text-dim mt-1">{ep.path}</div>
                  <div className="text-[11.5px] text-dim2 mt-1 leading-snug">{ep.desc}</div>
                </div>

                <button
                  onClick={() => executeEndpoint(ep, idx)}
                  disabled={loadingIndex === idx}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-amber/40 bg-amber/10 text-amberLight font-mono text-[11px] font-semibold hover:bg-amber/20 transition-all disabled:opacity-50 shrink-0 mt-1"
                >
                  {loadingIndex === idx ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  Execute
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Live Response & Telemetry Terminal */}
        <div className="flex flex-col rounded-[4px] border border-line bg-[#080B10] p-4 font-mono text-[12px]">
          <div className="flex items-center justify-between border-b border-[#1A2230] pb-2.5 mb-3">
            <div className="flex items-center gap-2 text-dim">
              <Terminal size={14} className="text-amber" />
              <span className="text-[11px] uppercase tracking-wider">Live Response Payload</span>
            </div>
            {responseLog && (
              <div className="flex items-center gap-2 text-[10.5px]">
                <span className="text-green font-bold">{responseLog.status}</span>
                <span className="text-dim">({responseLog.latency})</span>
                <span className="text-dim2">{responseLog.timestamp}</span>
              </div>
            )}
          </div>

          {responseLog ? (
            <div className="flex-1 overflow-auto max-h-[500px]">
              <div className="text-[11px] text-amber mb-2">
                &gt; {responseLog.method} {responseLog.path}
              </div>
              <pre className="text-[11px] text-ink2 leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(responseLog.data, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-dim text-center">
              <Terminal size={24} className="text-faint mb-2" />
              <div>No endpoint executed yet.</div>
              <div className="text-[11px] text-dim2 mt-1">
                Click "Execute" on any operation to view live JSON telemetry.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
