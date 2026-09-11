// IBVAP Sentinel — frontend/src/components/video/VideoDvrController.jsx
// Tactical Video DVR Scrub, Rewind, Fast-Forward, Playback Speed & Real-Time Clip Recording.

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Video,
  Square,
  Scissors,
  CheckCircle2,
  Download,
  ShieldAlert,
  Clock,
  Disc,
} from "lucide-react";
import { LiveVideoClipRecorder } from "../../lib/clipCapture.js";

export default function VideoDvrController({
  videoRef,
  cameraId = "CAM_ALPHA",
  cameraName = "Primary Optical Node",
  onClipCaptured = null,
  compact = false,
  className = "",
}) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLive, setIsLive] = useState(true);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef(null);

  // Synchronize state with video element
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const onTime = () => {
      setCurrentTime(video.currentTime || 0);
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
        // If within 0.5s of the end or actively looped, consider live
        setIsLive(video.duration - video.currentTime < 0.8);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onLoaded = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("loadedmetadata", onLoaded);

    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }
    setIsPlaying(!video.paused);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [videoRef]);

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [videoRef]);

  // Rewind helper (seconds)
  const seekRelative = useCallback(
    (deltaSec) => {
      const video = videoRef?.current;
      if (!video) return;
      const target = Math.max(0, Math.min(video.duration || 9999, video.currentTime + deltaSec));
      video.currentTime = target;
      setCurrentTime(target);
      setIsLive(false);
    },
    [videoRef]
  );

  // Step exact single frame (~33ms at 30fps)
  const stepFrame = useCallback(
    (direction = 1) => {
      const video = videoRef?.current;
      if (!video) return;
      if (!video.paused) {
        video.pause();
        setIsPlaying(false);
      }
      const frameDelta = 1 / 30; // 30 FPS
      const target = Math.max(0, Math.min(video.duration || 9999, video.currentTime + direction * frameDelta));
      video.currentTime = target;
      setCurrentTime(target);
      setIsLive(false);
    },
    [videoRef]
  );

  // Change playback speed
  const changeSpeed = useCallback(
    (rate) => {
      const video = videoRef?.current;
      if (!video) return;
      video.playbackRate = rate;
      setPlaybackRate(rate);
    },
    [videoRef]
  );

  // Jump back to live/current loop end
  const jumpToLive = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    if (video.duration && !isNaN(video.duration)) {
      video.currentTime = Math.max(0, video.duration - 0.2);
    }
    video.play().catch(() => {});
    setIsPlaying(true);
    setIsLive(true);
  }, [videoRef]);

  // Start Live Clip Recording
  const startRecording = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    try {
      const rec = new LiveVideoClipRecorder(video, {
        onTick: (sec) => setRecordSeconds(Math.round(sec)),
      });
      rec.start();
      recorderRef.current = rec;
      setIsRecording(true);
      setRecordSeconds(0);
    } catch (err) {
      console.error("[DVR] Failed to start recorder:", err);
    }
  }, [videoRef]);

  // Stop Recording & Send Blob to handler
  const stopRecording = useCallback(async () => {
    if (!recorderRef.current || !isRecording) return;
    try {
      const result = await recorderRef.current.stop();
      setIsRecording(false);
      setRecordSeconds(0);
      recorderRef.current = null;

      if (onClipCaptured) {
        onClipCaptured({
          blob: result.blob,
          durationSec: result.durationSec,
          mimeType: result.mimeType,
          extension: result.extension,
          cameraId,
          cameraName,
        });
      }
    } catch (err) {
      console.error("[DVR] Failed to stop recorder:", err);
      setIsRecording(false);
      recorderRef.current = null;
    }
  }, [isRecording, onClipCaptured, cameraId, cameraName]);

  // Instant DVR Snapshot (Trims/Captures the active playing loop into a clip)
  const captureInstantLoop = useCallback(async () => {
    const video = videoRef?.current;
    if (!video) return;

    // If active video source is a URL file, fetch the blob directly for lossless export
    if (video.src && video.src.startsWith("http")) {
      try {
        const res = await fetch(video.src);
        const blob = await res.blob();
        if (onClipCaptured) {
          onClipCaptured({
            blob,
            durationSec: Math.round(video.duration || 10),
            mimeType: blob.type || "video/mp4",
            extension: "mp4",
            cameraId,
            cameraName,
          });
        }
        return;
      } catch {
        // fallback to live record
      }
    }

    // Otherwise record a 5-second burst
    startRecording();
    setTimeout(() => {
      stopRecording();
    }, 5000);
  }, [videoRef, onClipCaptured, cameraId, cameraName, startRecording, stopRecording]);

  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`rounded-xl border border-white/15 bg-black/85 backdrop-blur-md p-3 shadow-2xl text-white select-none ${className}`}
    >
      {/* Top Scrubber Bar */}
      <div className="flex flex-col gap-1.5 mb-2.5">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <button
              onClick={jumpToLive}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                isLive
                  ? "bg-red-500/30 text-red-300 border border-red-500/50"
                  : "bg-white/10 text-slate-300 hover:text-white"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-red-400 animate-pulse" : "bg-slate-400"}`} />
              <span>{isLive ? "LIVE SYNC" : "DVR REWIND"}</span>
            </button>
            <span className="text-white font-bold">{formatTime(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-2">
            {isRecording && (
              <span className="flex items-center gap-1.5 text-red-400 font-bold animate-pulse text-[10.5px]">
                <Disc size={12} className="animate-spin" />
                <span>REC {formatTime(recordSeconds)}</span>
              </span>
            )}
            <span className="hidden sm:inline text-slate-500 text-[10px]">{cameraName}</span>
          </div>
        </div>

        {/* Precision Progress / Seek Slider */}
        <div className="relative flex items-center h-4 group cursor-pointer">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.05"
            value={currentTime}
            onChange={(e) => {
              const target = parseFloat(e.target.value);
              if (videoRef?.current) {
                videoRef.current.currentTime = target;
              }
              setCurrentTime(target);
              setIsLive(false);
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 hover:accent-sky-300 transition-all z-10"
          />
          {/* Visual Track bar */}
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-gradient-to-r from-sky-500 to-sky-400 rounded-l-lg pointer-events-none"
            style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>
      </div>

      {/* Control Buttons Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Playback & Rewind Controls */}
        <div className="flex items-center gap-1">
          {/* Rewind 10s */}
          <button
            onClick={() => seekRelative(-10)}
            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-white/10 hover:bg-sky-500/20 hover:text-sky-300 border border-white/10 text-[11px] font-mono transition-all"
            title="Rewind 10 seconds"
          >
            <RotateCcw size={12} />
            <span>-10s</span>
          </button>

          {/* Rewind 5s */}
          <button
            onClick={() => seekRelative(-5)}
            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-white/10 hover:bg-sky-500/20 hover:text-sky-300 border border-white/10 text-[11px] font-mono transition-all"
            title="Rewind 5 seconds"
          >
            <RotateCcw size={11} />
            <span>-5s</span>
          </button>

          {/* Step Frame Back */}
          <button
            onClick={() => stepFrame(-1)}
            className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white border border-white/10 transition-all"
            title="Step Back 1 Frame (-1/30s)"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Play / Pause Toggle */}
          <button
            onClick={togglePlay}
            className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold border transition-all ${
              isPlaying
                ? "bg-sky-500 text-black border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                : "bg-white text-black border-white hover:bg-sky-400"
            }`}
            title={isPlaying ? "Pause footage (Space)" : "Play footage (Space)"}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>

          {/* Step Frame Forward */}
          <button
            onClick={() => stepFrame(1)}
            className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white border border-white/10 transition-all"
            title="Step Forward 1 Frame (+1/30s)"
          >
            <ChevronRight size={14} />
          </button>

          {/* Fast Forward 5s */}
          <button
            onClick={() => seekRelative(5)}
            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-white/10 hover:bg-sky-500/20 hover:text-sky-300 border border-white/10 text-[11px] font-mono transition-all"
            title="Fast Forward 5 seconds"
          >
            <span>+5s</span>
            <RotateCw size={11} />
          </button>

          {/* Fast Forward 10s */}
          <button
            onClick={() => seekRelative(10)}
            className="flex items-center gap-0.5 px-2 py-1 rounded-md bg-white/10 hover:bg-sky-500/20 hover:text-sky-300 border border-white/10 text-[11px] font-mono transition-all"
            title="Fast Forward 10 seconds"
          >
            <span>+10s</span>
            <RotateCw size={12} />
          </button>
        </div>

        {/* Speed Controls (0.5x, 1x, 2x) */}
        <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/15 text-[10.5px] font-mono">
          {[0.5, 1.0, 2.0].map((rate) => (
            <button
              key={rate}
              onClick={() => changeSpeed(rate)}
              className={`px-2 py-0.5 rounded font-bold transition-all ${
                playbackRate === rate
                  ? "bg-sky-500/30 text-sky-300 border border-sky-400/60"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        {/* Clip Capture Actions */}
        <div className="flex items-center gap-2">
          {/* Live Record Clip Button */}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/50 text-xs font-bold transition-all shadow-[0_0_12px_rgba(239,68,68,0.25)]"
              title="Start recording a video clip from this feed"
            >
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span>Record Clip</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white border border-red-400 text-xs font-extrabold animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.6)]"
              title="Stop recording and save clip with cryptographic SHA-256 hash"
            >
              <Square size={13} className="fill-current" />
              <span>Stop & Save ({formatTime(recordSeconds)})</span>
            </button>
          )}

          {/* Instant Clip (Last Loop) */}
          <button
            onClick={captureInstantLoop}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-sky-500/20 text-sky-300 border border-sky-400/40 text-xs font-medium transition-all"
            title="Instant Clip: Extract current loop into an evidentiary clip"
          >
            <Scissors size={13} />
            <span className="hidden sm:inline">Instant Clip</span>
          </button>
        </div>
      </div>
    </div>
  );
}
