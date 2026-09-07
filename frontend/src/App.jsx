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
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="h-16 w-16 bg-white text-black border border-white flex items-center justify-center mb-6">
            <span className="text-2xl">⚠</span>
          </div>
          <h1 className="text-lg font-bold tracking-wide text-white uppercase mb-2">
            Console Diagnostics Required
          </h1>
          <p className="text-white/60 text-sm max-w-md mb-6">
            A transient interface anomaly was intercepted. Operational state has been preserved safely.
          </p>
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
