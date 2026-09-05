import { useState } from "react";
import { ShieldCheck, FileText, RefreshCw } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

/**
 * Chain of Custody — the real SHA-256 hash-chain + verify logic, unchanged;
 * only the presentation changed, to the same dark-navy/sky-blue glass
 * language as the rest of the COP console.
 */
export default function EvidencePanel({ blockchain, error }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyBlockchain();
      setVerifyResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setVerifying(false);
    }
  };

  const blocks = blockchain?.blocks || [];

  return (
    <div className="h-full overflow-y-auto p-6 text-slate-200">
      <SectionHeader
        title="Chain of Custody"
        sub="SHA-256 hash chain securing tamper-evident custody of every confirmed critical incident."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-300">
          Couldn't reach the backend. Start it with <code className="font-mono">python run_ecosystem.py</code>.
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-black/40 p-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <div>
            <div className="font-mono text-[12px] font-bold text-white uppercase tracking-wider">Sealed Incident Chain</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Each record commits the hash of the record before it.</div>
          </div>

          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 rounded border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-sky-300 hover:bg-sky-500/20 transition-all disabled:opacity-50"
          >
            {verifying ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={13} />}
            <span>Run Cryptographic Audit</span>
          </button>
        </div>

        {verifyResult && (
          <div
            className={`mb-4 rounded p-3 font-mono text-[11.5px] border ${
              verifyResult.is_valid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"
            }`}
          >
            <div className="font-bold">
              {verifyResult.is_valid
                ? "✓ 100% UNTAMPERED EVIDENCE INTEGRITY VERIFIED"
                : `⚠ CHAIN BROKEN AT BLOCK #${verifyResult.broken_index}: ${verifyResult.reason}`}
            </div>
            <div className="text-[10.5px] mt-1 opacity-80">
              Verified {verifyResult.verified_records || blocks.length} sealed ledger blocks against genesis.
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 overflow-x-auto py-2">
          {blocks.length === 0 && (
            <div className="font-mono text-[11.5px] text-slate-500">Genesis block active. Chain ready for incoming confirmed incidents.</div>
          )}
          {blocks.map((b, idx) => (
            <div key={b.block_index} className="flex items-center gap-2">
              <div className="rounded border border-white/10 bg-black/40 p-3 font-mono text-[11px] min-w-[150px]">
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                  <span>#{b.block_index}</span>
                  <span className="text-sky-400 font-bold">{b.payload?.incident_id || "SEAL"}</span>
                </div>
                <div className="text-white font-bold truncate">{b.current_hash?.slice(0, 12)}...</div>
              </div>
              {idx < blocks.length - 1 && <span className="text-slate-600 font-bold font-mono">➔</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-black/40 p-4 flex items-center justify-between">
        <div>
          <div className="font-mono text-[11.5px] font-bold text-white">Court-Admissible Incident Dossier Registry</div>
          <div className="text-[11.5px] text-slate-500 mt-0.5">Timeline, evidence summaries, radar plots, and chain of custody proof.</div>
        </div>

        <a
          href="/incidents/INC-1041/dossier"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/10 bg-black/40 text-[11.5px] text-slate-400 hover:text-white font-mono"
        >
          <FileText size={13} className="text-sky-400" />
          <span>View Dossier</span>
        </a>
      </div>
    </div>
  );
}
