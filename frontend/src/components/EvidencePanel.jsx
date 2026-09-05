import { useState } from "react";
import { Link2, CircleCheck, CircleX } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

export default function EvidencePanel({ blockchain, error }) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  const blocks = blockchain?.blocks || [];

  async function runAudit() {
    setVerifying(true);
    try {
      const res = await api.verifyBlockchain();
      setResult(res);
    } catch (e) {
      setResult({ is_valid: false, reason: e.message, logs: [] });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Tamper-Evident Evidence Chain"
        sub="Each incident capsule is SHA-256 hashed against the previous block — an edit breaks the chain."
      />

      {error && (
        <div className="mb-4 rounded-[4px] border border-red/40 bg-red/10 px-3.5 py-2.5 text-[12px] text-red">
          Couldn't reach the backend. Start it with <code className="font-mono">python run_ecosystem.py</code>.
        </div>
      )}

      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={runAudit}
          disabled={verifying}
          className="rounded-[3px] border border-amber/40 bg-amber/10 px-3.5 py-1.5 text-[12px] font-medium text-amberLight transition-colors hover:bg-amber/20 disabled:opacity-50"
        >
          {verifying ? "Verifying…" : "Run cryptographic audit"}
        </button>
        {result && result.is_valid && (
          <span className="flex items-center gap-1.5 font-mono text-[12px] text-green">
            <CircleCheck size={13} /> {blocks.length} blocks verified, chain intact
          </span>
        )}
        {result && !result.is_valid && (
          <span className="flex items-center gap-1.5 font-mono text-[12px] text-red">
            <CircleX size={13} /> Broken at block #{result.broken_index}: {result.reason}
          </span>
        )}
      </div>

      {blocks.length === 0 && !error && (
        <div className="rounded-[4px] border border-line bg-panel px-4 py-6 text-center text-[12.5px] text-dim">
          No blocks sealed yet — only CRITICAL incidents get sealed. Run a Simulate Handoff to create one.
        </div>
      )}

      <div className="flex flex-wrap items-stretch gap-0">
        {blocks.map((b, i) => (
          <div key={b.current_hash} className="flex items-stretch">
            <div className="w-[170px] rounded-[4px] border border-line bg-panel px-3 py-2.5">
              <div className="font-mono text-[10px] text-dim2">BLOCK #{b.block_index}</div>
              <div className="mt-1 truncate font-mono text-[12px] text-amber">{b.current_hash.slice(0, 12)}…</div>
              <div className="mt-1 truncate font-mono text-[9.5px] text-faint">{b.payload?.incident_id}</div>
            </div>
            {i < blocks.length - 1 && (
              <div className="flex w-8 items-center justify-center">
                <Link2 size={13} className="text-line2" />
              </div>
            )}
          </div>
        ))}
      </div>

      {result?.logs?.length > 0 && (
        <div className="mt-5 rounded-[4px] border border-line bg-panel2 p-3 font-mono text-[11px] text-dim2">
          {result.logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
