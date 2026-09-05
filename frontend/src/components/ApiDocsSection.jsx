import { ExternalLink, Terminal, Code2, Copy, Check } from "lucide-react";
import { useState } from "react";
import SectionHeader from "./SectionHeader.jsx";

const API_ENDPOINTS = [
  {
    method: "GET",
    path: "/cameras/health",
    desc: "Heartbeat, lens diagnostics, and online/offline status for all sector optical nodes.",
  },
  {
    method: "GET",
    path: "/incidents/correlated",
    desc: "Multi-camera correlated tracks with explainable threat factor breakdowns and transit times.",
  },
  {
    method: "POST",
    path: "/siren/silence",
    desc: "Silences hardware acoustic perimeter alarm and resets active sirens.",
  },
  {
    method: "GET",
    path: "/audit/blockchain",
    desc: "Tamper-evident SHA-256 Merkle chain blocks sealing critical incident evidence.",
  },
  {
    method: "GET",
    path: "/calibration",
    desc: "Site false-positive categorization metrics by root cause (vegetation, animal, weather).",
  },
];

export default function ApiDocsSection() {
  const [copied, setCopied] = useState(false);

  const curlCommand = "curl -s http://localhost:8000/incidents/correlated | jq .";

  const handleCopy = () => {
    navigator.clipboard?.writeText(curlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-5 text-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <SectionHeader
          title="API Documentation & Edge Integration"
          sub="Direct REST interface for higher-echelon command systems and external C4I telemetry ingestion."
        />
        <a
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-2 font-mono text-[12px] font-bold text-sky-300 hover:border-sky-400 hover:bg-sky-500/20 transition-all shadow-[0_0_12px_rgba(56,189,248,0.15)]"
        >
          <span>OPEN LIVE SWAGGER DOCS</span>
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {API_ENDPOINTS.map((ep) => (
          <div
            key={ep.path}
            className="flex flex-col justify-between rounded-lg border border-white/10 bg-black/40 p-4 transition-all hover:border-white/20 hover:bg-black/60"
          >
            <div>
              <div className="flex items-center gap-2 font-mono text-[11px] mb-2">
                <span
                  className={`rounded px-1.5 py-0.5 font-bold ${
                    ep.method === "POST"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                  }`}
                >
                  {ep.method}
                </span>
                <span className="font-semibold text-white truncate">{ep.path}</span>
              </div>
              <p className="text-[11.5px] text-slate-400 leading-relaxed">{ep.desc}</p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between font-mono text-[10px] text-slate-500">
              <span>RESPONSE: JSON</span>
              <span>AUTH: MUTUAL TLS / BEARER</span>
            </div>
          </div>
        ))}

        {/* Quick CLI snippet card */}
        <div className="flex flex-col justify-between rounded-lg border border-sky-500/20 bg-sky-950/20 p-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-sky-300 mb-2">
              <Terminal size={13} />
              <span>QUICK CURL QUERY</span>
            </div>
            <div className="relative rounded bg-black/60 p-2.5 font-mono text-[11px] text-emerald-400 border border-white/10 overflow-x-auto">
              <code>{curlCommand}</code>
            </div>
          </div>
          <button
            onClick={handleCopy}
            className="mt-3 flex items-center justify-center gap-1.5 rounded border border-white/10 bg-black/40 py-1.5 font-mono text-[10.5px] text-slate-300 hover:text-white hover:border-white/25 transition-all"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-400" />
                <span className="text-emerald-400">COPIED TO CLIPBOARD</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>COPY CLI COMMAND</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
