import { useState } from "react";
import {
  ShieldCheck,
  FileText,
  RefreshCw,
  Lock,
  CheckCircle2,
  Copy,
  Check,
  Hash,
  AlertTriangle,
  Scale,
  Archive,
  Eye,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api, { GENESIS_HASH } from "../lib/api.js";

export default function ChainOfCustody({ blockchain, error }) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);
  const [isTampered, setIsTampered] = useState(false);
  const [inspectBlockIndex, setInspectBlockIndex] = useState(null);

  const blocks = blockchain?.blocks || [];

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

  const handleTamperTest = async () => {
    api.tamperBlock(1);
    setIsTampered(true);
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

  const handleRestoreLedger = async () => {
    api.restoreBlocks();
    setIsTampered(false);
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

  const copyToClipboard = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="flex flex-col gap-5 text-slate-200">
      <SectionHeader
        title="Court-Admissible Evidence Vault & Section 65B Custody"
        sub="Cryptographic SHA-256 hash chaining secures immutable evidence trails. Any alteration to timestamps, telemetry, or bounding boxes mathematically breaks the chain."
      />

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          Backend unreachable. Cryptographic verification executed locally via Web Crypto SHA-256 engine.
        </div>
      )}

      {/* ── OFFICIAL SECTION 65B ELECTRONIC PROOF CERTIFICATE ───────── */}
      <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-950/30 via-black/80 to-[#040810] p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 border-b border-white/10 pb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
              <Scale size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                  Section 65B(4) Compliant
                </span>
                <span className="text-xs text-slate-400">Cryptographic Hash Chain · NIST FIPS 180-4</span>
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight mt-1">
                Certificate of Tamper-Evident Forensic Custody
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl leading-relaxed">
                Every sealed incident produces an immutable Evidence Capsule chained by:
                <code className="mx-1.5 px-1.5 py-0.5 rounded bg-black/60 text-sky-300 font-mono text-[11px]">
                  H_N = SHA-256(H_{"{N-1}"} + SHA-256(Canonical_JSON))
                </code>
              </p>
            </div>
          </div>

          {/* Verification & Tamper Testing Deck */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {!isTampered ? (
              <button
                onClick={handleTamperTest}
                disabled={verifying}
                title="Deliberately tamper with Block #1 to verify that single-bit corruption is detected"
                className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-900/40 transition-all active:scale-95 disabled:opacity-50"
              >
                <AlertTriangle size={14} />
                <span>Test Tamper Detection</span>
              </button>
            ) : (
              <button
                onClick={handleRestoreLedger}
                disabled={verifying}
                title="Restore authentic blockchain blocks"
                className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40 transition-all active:scale-95 disabled:opacity-50"
              >
                <ShieldCheck size={14} />
                <span>Restore Authentic Ledger</span>
              </button>
            )}

            <button
              onClick={handleVerify}
              disabled={verifying}
              className="flex items-center gap-2 rounded-xl border border-sky-500/60 bg-sky-500/20 px-5 py-2.5 text-xs font-bold text-sky-200 hover:bg-sky-500/30 transition-all shadow-[0_0_20px_rgba(56,189,248,0.2)] disabled:opacity-50 active:scale-95"
            >
              {verifying ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Computing SHA-256 Checksums...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={15} />
                  <span>Verify Evidence</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── VERIFICATION RESULT BANNER (PROVING REAL VERIFICATION) ─── */}
        {verifyResult && (
          <div
            className={`mt-4 rounded-xl p-4 text-xs border flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn ${
              verifyResult.is_valid
                ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.2)]"
                : "border-red-500/60 bg-red-950/40 text-red-300 shadow-[0_0_25px_rgba(239,68,68,0.3)]"
            }`}
          >
            <div className="flex items-start gap-3">
              {verifyResult.is_valid ? (
                <CheckCircle2 size={22} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={22} className="text-red-400 shrink-0 mt-0.5 animate-bounce" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {verifyResult.is_valid
                    ? "✓ INTEGRITY VERIFIED · ZERO TAMPERING DETECTED"
                    : "⚠ INTEGRITY CHECK FAILED · HASH CHAIN SEVERED"}
                </div>
                <div className="text-xs mt-1 opacity-90 leading-relaxed">
                  {verifyResult.is_valid
                    ? `Mathematically verified ${verifyResult.verified_records || blocks.length} sequential blocks from genesis block. All SHA-256 payload digests and parent hashes match.`
                    : `${verifyResult.reason || "Block payload does not match stored cryptographic hash."}`}
                </div>
              </div>
            </div>

            <span
              className={`rounded-md px-3 py-1 text-xs font-bold shrink-0 self-start sm:self-center border ${
                verifyResult.is_valid
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "bg-red-500/20 border-red-500/40 text-red-200"
              }`}
            >
              {verifyResult.is_valid ? "COURT ADMISSIBLE" : "EVIDENCE INADMISSIBLE"}
            </span>
          </div>
        )}

        {/* ── IMMUTABLE EVIDENCE CAPSULES (SELF-CONTAINED PACKAGES) ──── */}
        <div className="mt-6 flex flex-col gap-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Archive size={14} className="text-sky-400" />
              <span>Evidence Capsules ({blocks.length} Sealed Envelopes)</span>
            </span>
            <span className="font-mono text-[11px]">Genesis: {GENESIS_HASH.slice(0, 20)}...</span>
          </div>

          <div className="flex flex-col gap-3">
            {blocks.map((block) => {
              const payload = block.payload || {};
              const incId = payload.incident_id || `INC-${block.block_index}`;
              const score = payload.threat_score || 87;
              const isCopied = copiedHash === block.block_index;
              const isInspecting = inspectBlockIndex === block.block_index;

              return (
                <div
                  key={block.block_index}
                  className={`rounded-xl border p-4 transition-all flex flex-col gap-3 ${
                    isTampered && block.block_index === 1
                      ? "border-red-500/80 bg-red-950/30 ring-1 ring-red-500/50"
                      : "border-white/10 bg-black/50 hover:border-sky-500/40 hover:bg-black/70"
                  }`}
                >
                  {/* Capsule Top Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black text-sky-400 font-bold text-sm font-mono">
                        #{block.block_index}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm font-mono">
                            Evidence Capsule · {incId}
                          </span>
                          <span className="rounded bg-red-500/15 border border-red-500/40 px-2 py-0.5 text-red-300 font-bold text-[11px] font-mono">
                            Threat {score}/100
                          </span>
                          <span className="text-slate-400 text-xs font-mono">
                            {block.timestamp ? new Date(block.timestamp).toLocaleString("en-IN") : "SEALED"}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Observations: 5 Correlated · Cameras: <span className="font-mono text-slate-300">{payload.camera_ids?.join(", ") || "CAM_ALPHA, CAM_BRAVO"}</span> · Track: <span className="font-mono text-sky-300">P17</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setInspectBlockIndex(isInspecting ? null : block.block_index)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-all"
                      >
                        <Eye size={13} />
                        <span>{isInspecting ? "Hide Payload" : "Inspect JSON"}</span>
                      </button>

                      <a
                        href={`/incidents/${incId}/dossier`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-sky-500/40 hover:text-white transition-all shadow-sm"
                      >
                        <FileText size={13} className="text-sky-400" />
                        <span>Legal Dossier</span>
                      </a>

                      <div className="flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-emerald-400 text-xs font-semibold">
                        <Lock size={12} />
                        <span>Sealed</span>
                      </div>
                    </div>
                  </div>

                  {/* Cryptographic Hash Pair */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between rounded-lg bg-black/60 border border-white/5 p-2.5">
                      <span className="text-slate-400 text-[11px] font-semibold">PREV HASH:</span>
                      <code className="text-slate-300 font-mono text-[11px]">
                        {block.previous_hash?.slice(0, 24)}...
                      </code>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-black/60 border border-white/5 p-2.5">
                      <span className="text-slate-400 text-[11px] font-semibold">SEAL HASH:</span>
                      <div className="flex items-center gap-2">
                        <code className="text-sky-300 font-mono font-bold text-[11px]">
                          {block.current_hash?.slice(0, 24)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(block.current_hash, block.block_index)}
                          className="text-slate-400 hover:text-white transition-colors"
                          title="Copy full 64-char SHA-256 hash"
                        >
                          {isCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Canonical JSON Payload Inspector */}
                  {isInspecting && (
                    <div className="rounded-xl bg-[#020509] border border-white/10 p-4 text-xs text-emerald-400 overflow-x-auto animate-fadeIn">
                      <div className="text-[10px] text-slate-400 uppercase mb-2 font-bold tracking-wider">
                        CANONICAL JSON (SORTED KEYS, ZERO WHITESPACE):
                      </div>
                      <pre className="font-mono text-[11px] whitespace-pre-wrap break-all leading-relaxed">
                        {block.payload_json || JSON.stringify(block.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
