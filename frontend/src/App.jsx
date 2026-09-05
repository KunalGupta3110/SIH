import React, { Component } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./components/LandingPage.jsx";
import ConsoleDashboard from "./components/ConsoleDashboard.jsx";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Watchfloor Boundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080d16] text-slate-200 flex flex-col items-center justify-center p-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mb-6 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold font-mono tracking-wider text-white uppercase mb-2">
            Watchfloor Console Diagnostics Required
          </h1>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            A transient interface component anomaly was intercepted. The tactical state has been preserved safely.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-lg"
            >
              RELOAD WATCHFLOOR
            </button>
            <button
              onClick={() => {
                window.location.href = "/";
              }}
              className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs transition-all"
            >
              RETURN TO BASE
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/console" element={<ConsoleDashboard />} />
          <Route path="/surveillance" element={<ConsoleDashboard initialNav="surveillance" />} />
          <Route path="/incidents" element={<ConsoleDashboard initialNav="incidents" />} />
          <Route path="/map" element={<ConsoleDashboard initialNav="map" />} />
          <Route path="/tracking" element={<ConsoleDashboard initialNav="tracking" />} />
          <Route path="/reconstruction" element={<ConsoleDashboard initialNav="reconstruction" />} />
          <Route path="/evidence" element={<ConsoleDashboard initialNav="evidence" />} />
          <Route path="/analytics" element={<ConsoleDashboard initialNav="analytics" />} />
          <Route path="/hardware" element={<ConsoleDashboard initialNav="hardware" />} />
          <Route path="/reports" element={<ConsoleDashboard initialNav="reports" />} />
          <Route path="/settings" element={<ConsoleDashboard initialNav="settings" />} />
          <Route path="*" element={<Navigate to="/console" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
