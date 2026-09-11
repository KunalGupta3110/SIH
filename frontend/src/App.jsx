import React, { Component } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./components/LandingPage.jsx";
import ConsoleDashboard from "./components/ConsoleDashboard.jsx";
import LoginPage from "./components/LoginPage.jsx";
import PersonnelEnrollment from "./components/PersonnelEnrollment.jsx";

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
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="h-16 w-16 bg-white text-black border border-white flex items-center justify-center mb-6">
            <span className="text-2xl">⚠</span>
          </div>
          <h1 className="text-lg font-bold tracking-wide text-white uppercase mb-2">
            Console Diagnostics Required
          </h1>
          <p className="text-white/60 text-sm max-w-md mb-4">
            A transient interface anomaly was intercepted. Operational state has been preserved safely.
          </p>
          {this.state.error?.message && (
            <details className="mb-6 max-w-lg text-left bg-neutral-900 border border-white/10 rounded-lg p-3 text-xs font-mono text-amber-300/90 cursor-pointer">
              <summary className="text-slate-400 select-none pb-1 hover:text-white">
                Diagnostic Trace ({this.state.error.name || "Error"})
              </summary>
              <div className="pt-2 text-[11px] text-red-300 break-words whitespace-pre-wrap border-t border-white/10 mt-1">
                {this.state.error.message}
              </div>
            </details>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-5 py-2.5 bg-white text-black hover:bg-black hover:text-white border border-white font-bold text-xs transition-all"
            >
              RELOAD CONSOLE
            </button>
            <button
              onClick={() => {
                window.location.href = "/";
              }}
              className="px-5 py-2.5 bg-black text-white hover:bg-white hover:text-black border border-white text-xs transition-all"
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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<PersonnelEnrollment />} />
          <Route path="/console" element={<ConsoleDashboard initialNav="watchfloor" />} />
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
