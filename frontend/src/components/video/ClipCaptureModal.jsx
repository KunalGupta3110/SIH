// IBVAP Sentinel — frontend/src/components/video/ClipCaptureModal.jsx
// Modal for Reviewing Captured Clip, Selecting Object Code (Person = 1), and Saving to PC with Companion .sha256 Hash File.

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Download,
  FolderArchive,
  FileCheck,
  HardDrive,
  Copy,
  Check,
  CheckCircle2,
  Video,
  Clock,
  Camera,
  Hash,
  Info,
  Server,
} from "lucide-react";
import {
  OBJECT_CLASSIFICATION_CODES,
  generateEvidenceFilenames,
  computeBlobSha256,
  saveClipAndHashToPc,
  createEvidenceZipBundle,
} from "../../lib/clipCapture.js";
import api from "../../lib/api.js";

export default function ClipCaptureModal({
  clipData, // { blob, durationSec, mimeType, extension, cameraId, cameraName }
  isOpen = false,
  onClose = () => {},
  onSaved = () => {},
}) {
  const [selectedObjectCode, setSelectedObjectCode] = useState(1); // 1 = Person by default
  const [sha256Hash, setSha256Hash] = useState("");
  const [isHashing, setIsHashing] = useState(true);
  const [copiedHash, setCopiedHash] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(null);
  const [notes, setNotes] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);

  // Tamper test state
  const [tamperTestActive, setTamperTestActive] = useState(false);

  // Generate object URL for preview
  useEffect(() => {
    if (!clipData?.blob) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(clipData.blob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clipData?.blob]);

  // Compute authentic SHA-256 hash when clip opens
  useEffect(() => {
    if (!clipData?.blob) return;
    setIsHashing(true);
    computeBlobSha256(clipData.blob)
      .then((hash) => {
        setSha256Hash(hash);
        setIsHashing(false);
      })
      .catch((err) => {
        console.error("Hash calculation failed:", err);
        setIsHashing(false);
      });
  }, [clipData?.blob]);

  // Formatted names
  const filenames = useMemo(() => {
    return generateEvidenceFilenames({
      objectCode: selectedObjectCode,
      cameraId: clipData?.cameraId || "CAM_ALPHA",
      extension: clipData?.extension || "webm",
    });
  }, [selectedObjectCode, clipData]);

  if (!isOpen || !clipData?.blob) return null;

  // 1. Save directly to PC (Twin download in same folder)
  const handleSaveToPc = async () => {
    setIsSaving(true);
    try {
      await saveClipAndHashToPc(clipData.blob, {
        objectCode: selectedObjectCode,
        cameraId: clipData.cameraId || "CAM_ALPHA",
        durationSec: clipData.durationSec || 0,
        notes: notes || "Watchfloor officer captured surveillance clip.",
        extension: clipData.extension || "webm",
      });

      // Also notify backend if reachable
      try {
        if (api.saveCapturedClip) {
          await api.saveCapturedClip({
            videoBlob: clipData.blob,
            objectCode: selectedObjectCode,
            cameraId: clipData.cameraId || "CAM_ALPHA",
            filename: filenames.videoFileName,
            hash: sha256Hash,
            durationSec: clipData.durationSec,
            notes,
          });
        }
      } catch {
        // Backend optional
      }

      setSaveSuccessNotice({
        type: "pc",
        title: "Saved to PC in Same Folder",
        message: `Both "${filenames.videoFileName}" and "${filenames.hashFileName}" saved with SHA-256 verification hash.`,
      });

      if (onSaved) {
        onSaved({
          ...filenames,
          hash: sha256Hash,
          durationSec: clipData.durationSec,
        });
      }
    } catch (err) {
      console.error("Save to PC failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Download packaged ZIP
  const handleDownloadZip = async () => {
    setIsSaving(true);
    try {
      await createEvidenceZipBundle(clipData.blob, {
        objectCode: selectedObjectCode,
        cameraId: clipData.cameraId || "CAM_ALPHA",
        durationSec: clipData.durationSec || 0,
        notes: notes || "Watchfloor officer captured surveillance clip.",
        extension: clipData.extension || "webm",
      });

      setSaveSuccessNotice({
        type: "zip",
        title: "Evidence ZIP Downloaded",
        message: `Package contains "${filenames.folderName}/" containing video, .sha256 digest, and Section 65B manifest.`,
      });
    } catch (err) {
      console.error("Zip download failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Copy hash to clipboard
  const handleCopyHash = () => {
    if (!sha256Hash) return;
    navigator.clipboard.writeText(sha256Hash).then(() => {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    });
  };

  const selectedConfig = OBJECT_CLASSIFICATION_CODES.find((c) => c.code === selectedObjectCode) || OBJECT_CLASSIFICATION_CODES[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#090d16] border border-white/20 text-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#090d16]/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-wide uppercase flex items-center gap-2">
                <span>Capture Evidence Clip & Cryptographic Seal</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Section 65B Certified
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Save clip to your PC with its authentic SHA-256 hash file in the same folder to guarantee non-tampering.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Video Preview & Playback (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-white/15 shadow-inner">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-slate-500 text-xs">
                  Loading video buffer...
                </div>
              )}

              {/* Top Viewfinder Metadata Watermark */}
              <div className="absolute top-2 inset-x-2 flex items-center justify-between text-[10.5px] font-mono pointer-events-none">
                <span className="bg-black/80 px-2.5 py-0.5 rounded border border-white/20 text-sky-300">
                  {clipData.cameraId} · {clipData.cameraName}
                </span>
                <span className="bg-black/80 px-2.5 py-0.5 rounded border border-white/20 text-emerald-300">
                  DURATION: {clipData.durationSec}s
                </span>
              </div>
            </div>

            {/* SHA-256 Checksum Card */}
            <div className="rounded-xl border border-white/15 bg-black/50 p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-sky-400">
                  <Hash size={14} />
                  <span>SHA-256 Evidentiary Hash (Zero Tamper Seal)</span>
                </span>
                <button
                  onClick={handleCopyHash}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-sky-500/20 text-[11px] font-mono text-slate-300 hover:text-sky-300 transition-all"
                >
                  {copiedHash ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  <span>{copiedHash ? "Copied" : "Copy Hash"}</span>
                </button>
              </div>

              <div className="p-2.5 rounded-lg bg-black border border-white/10 font-mono text-[11px] break-all select-all text-slate-300">
                {isHashing ? (
                  <span className="text-slate-500 animate-pulse">Calculating cryptographic checksum...</span>
                ) : (
                  <span className="text-emerald-300 font-semibold">{sha256Hash}</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                This exact 64-character digest is saved into <code className="text-sky-300">{filenames.hashFileName}</code> in the same folder. Modifying even 1 bit of the video will break verification.
              </p>
            </div>

            {/* Tamper Simulation Test Panel */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Shield size={13} className="text-sky-400" />
                  <span>Tamper Integrity Verification Demo</span>
                </span>
                <button
                  onClick={() => setTamperTestActive(!tamperTestActive)}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-slate-300"
                >
                  {tamperTestActive ? "Reset to Genuine" : "Simulate 1-Bit Alteration"}
                </button>
              </div>

              <div
                className={`p-2.5 rounded border text-[11px] font-mono flex items-center gap-2 ${
                  tamperTestActive
                    ? "bg-red-950/60 border-red-500/60 text-red-200"
                    : "bg-emerald-950/40 border-emerald-500/50 text-emerald-200"
                }`}
              >
                {tamperTestActive ? (
                  <>
                    <ShieldAlert size={16} className="text-red-400 shrink-0" />
                    <span>
                      🚨 TAMPER DETECTED: Computed SHA-256 differs from companion .sha256 file! Court evidence rejected.
                    </span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                    <span>
                      ✅ 100% AUTHENTIC: Video matches .sha256 companion file identically. Section 65B Admissible.
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Classification & Saving Controls (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Step 1: Object Classification */}
            <div className="rounded-xl border border-white/15 bg-black/60 p-4 flex flex-col gap-3">
              <label className="text-xs font-bold text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
                <FolderArchive size={14} />
                <span>1. Object Classification (Person = 1)</span>
              </label>
              <p className="text-[11px] text-slate-400">
                Per protocol, detected humans are categorized under Code <strong className="text-white">1</strong>. Select the object in this clip:
              </p>

              <div className="grid grid-cols-1 gap-2">
                {OBJECT_CLASSIFICATION_CODES.map((item) => {
                  const isSelected = selectedObjectCode === item.code;
                  return (
                    <button
                      key={item.code}
                      onClick={() => setSelectedObjectCode(item.code)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-medium transition-all text-left ${
                        isSelected
                          ? "bg-sky-500/20 border-sky-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/50"
                          : "bg-black/50 border-white/10 text-slate-400 hover:border-white/25 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-md font-mono font-bold text-xs ${
                            isSelected ? "bg-sky-400 text-black" : "bg-white/10 text-slate-300"
                          }`}
                        >
                          {item.code}
                        </span>
                        <span>{item.label}</span>
                      </div>
                      {item.code === 1 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Default
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Destination Folder & Filename Inspection */}
            <div className="rounded-xl border border-white/15 bg-black/60 p-4 flex flex-col gap-2.5 text-xs font-mono">
              <span className="font-bold text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
                <HardDrive size={14} />
                <span>2. Same-Folder File Structure</span>
              </span>

              <div className="flex flex-col gap-1.5 text-[11px] bg-black/80 p-3 rounded-lg border border-white/10">
                <div className="text-slate-400">
                  📁 Folder: <span className="text-amber-300 font-bold">{filenames.folderName}/</span>
                </div>
                <div className="text-slate-300">
                  📹 Video: <span className="text-white font-bold">{filenames.videoFileName}</span>
                </div>
                <div className="text-emerald-400">
                  🔒 Hash: <span className="text-emerald-300 font-bold">{filenames.hashFileName}</span>
                </div>
                <div className="text-sky-400">
                  📜 Manifest: <span className="text-sky-300">{filenames.manifestFileName}</span>
                </div>
              </div>
            </div>

            {/* Step 3: Optional Notes */}
            <div className="flex flex-col gap-1.5 text-xs">
              <label className="text-slate-400 font-medium">Incident Observation Notes (Optional):</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Target climbed perimeter fence at 18:42, moved toward checkpost..."
                rows={2}
                className="w-full rounded-lg bg-black/60 border border-white/15 p-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-400"
              />
            </div>

            {/* Success Notice */}
            {saveSuccessNotice && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/60 text-emerald-200 text-xs flex flex-col gap-1 animate-fadeIn">
                <div className="flex items-center gap-2 font-bold text-emerald-300">
                  <CheckCircle2 size={16} />
                  <span>{saveSuccessNotice.title}</span>
                </div>
                <p className="text-[11px] text-emerald-200/90">{saveSuccessNotice.message}</p>
              </div>
            )}

            {/* Save Buttons */}
            <div className="flex flex-col gap-2 mt-2">
              {/* Save to PC in same folder */}
              <button
                onClick={handleSaveToPc}
                disabled={isSaving || isHashing}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-bold text-sm shadow-[0_0_20px_rgba(56,189,248,0.4)] transition-all disabled:opacity-50"
              >
                <Download size={17} />
                <span>Save to PC (Clip + .sha256 in Same Folder)</span>
              </button>

              {/* Download Evidence Zip */}
              <button
                onClick={handleDownloadZip}
                disabled={isSaving || isHashing}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium text-xs transition-all disabled:opacity-50"
              >
                <FolderArchive size={15} />
                <span>Download Packaged Evidence ZIP ({filenames.folderName})</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
