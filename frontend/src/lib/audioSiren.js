/**
 * IBVAP SENTINEL - Tactical Defense Acoustic Siren Engine
 * Native Web Audio API synthesizer for perimeter breach alarm.
 * Zero external audio files required. Real-time dual-tone emergency wail.
 */

class TacticalAudioSiren {
  constructor() {
    this.audioCtx = null;
    this.oscillator = null;
    this.gainNode = null;
    this.filterNode = null;
    this.intervalId = null;
    this.active = false;
    this.reason = "";
    this.listeners = new Set();
    this.volume = 0.25; // Safe, audible volume
    this.silenced = false;
    this.muted = false;
  }

  isActive() {
    return this.active;
  }

  isSilenced() {
    return this.silenced;
  }

  silence() {
    this.silenced = true;
    this.stop();
  }

  resetSilence() {
    this.silenced = false;
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.muted) {
      this.stop();
    }
  }

  subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    this.listeners.add(callback);
    try {
      callback({ active: this.active, reason: this.reason, silenced: this.silenced });
    } catch (e) {
      console.warn("Error in siren listener:", e);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener({ active: this.active, reason: this.reason, silenced: this.silenced });
      } catch (err) {
        console.warn("Error notifying siren listener:", err);
      }
    }
  }

  _initContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  start(reason = "CRITICAL PERIMETER BREACH DETECTED") {
    if (this.active || this.silenced || this.muted) return;
    this._initContext();
    if (!this.audioCtx) return;

    this.active = true;
    this.reason = reason;

    try {
      // Create high-urgency alternating tone emergency siren
      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();
      this.filterNode = this.audioCtx.createBiquadFilter();

      // Sawtooth produces the sharp, piercing acoustic horn signature
      this.oscillator.type = "sawtooth";
      this.oscillator.frequency.setValueAtTime(640, this.audioCtx.currentTime);

      // Low-pass filter to sound like an outdoor high-decibel air-raid / perimeter horn
      this.filterNode.type = "lowpass";
      this.filterNode.frequency.setValueAtTime(1600, this.audioCtx.currentTime);

      // Volume envelope
      this.gainNode.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
      this.gainNode.gain.exponentialRampToValueAtTime(this.volume, this.audioCtx.currentTime + 0.1);

      this.oscillator.connect(this.filterNode);
      this.filterNode.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.oscillator.start();

      // Dual-tone warble: alternates between 640 Hz and 960 Hz every 320ms
      let highTone = false;
      this.intervalId = setInterval(() => {
        if (!this.active || !this.oscillator || !this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        const targetFreq = highTone ? 640 : 960;
        this.oscillator.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.12);
        highTone = !highTone;
      }, 320);

      this._notify();
      window.dispatchEvent(new CustomEvent("sentinel-siren", { detail: { active: true, reason } }));
    } catch (err) {
      console.warn("Could not start audio siren:", err);
      this.stop();
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.reason = "";

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.gainNode && this.audioCtx) {
      try {
        // Smooth fade out over 80ms to avoid audio click
        this.gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.08);
      } catch (e) {}
    }

    setTimeout(() => {
      if (this.oscillator) {
        try {
          this.oscillator.stop();
          this.oscillator.disconnect();
        } catch (e) {}
        this.oscillator = null;
      }
    }, 90);

    this._notify();
    window.dispatchEvent(new CustomEvent("sentinel-siren", { detail: { active: false } }));
  }

  test(durationMs = 2500) {
    if (this.muted) return;
    const wasSilenced = this.silenced;
    this.silenced = false;
    this.start("TESTING DEFENSE SIREN");
    setTimeout(() => {
      this.stop();
      this.silenced = wasSilenced;
    }, durationMs);
  }

  // Tactical Sound Effects
  playClick() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(180, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.02, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.03);
    } catch (e) {}
  }

  playRadioChirp() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.08);
      osc.frequency.setValueAtTime(1100, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  playLockdown() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {}
  }

  playVerify() {
    if (this.muted) return;
    try {
      this._initContext();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0.12, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.15);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.15);
      });
    } catch (e) {}
  }
}

export const siren = new TacticalAudioSiren();
export default siren;

