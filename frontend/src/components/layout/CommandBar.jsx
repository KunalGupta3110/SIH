import React, { useState, useEffect } from 'react';
import { useSystem } from "../../contexts/SystemContext.jsx";

export default function CommandBar() {
  const systemContext = useSystem();
  
  // Safe destructuring with fallbacks
  const isSimulation = systemContext?.isSimulation ?? true;
  const isNetworkDown = systemContext?.isNetworkDown || false;
  const cameraCounts = systemContext?.cameraCounts || { total: 0, online: 0, warning: 0, offline: 0 };
  const activeIncidents = systemContext?.activeIncidents || [];
  
  const activeIncidentsCount = activeIncidents.length;
  const camerasOnline = cameraCounts.online;
  const camerasTotal = cameraCounts.total;
  const connectionStatus = isNetworkDown ? 'offline' : 'online';
  const systemStatus = isNetworkDown 
    ? 'degraded' 
    : (cameraCounts.warning > 0 || cameraCounts.offline > 0 ? 'warning' : 'healthy');

  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const secs = String(date.getSeconds()).padStart(2, '0');
    
    return `${day} ${month} ${year} ${hours}:${mins}:${secs} IST`;
  };

  const getStatusColor = (status) => {
    if (status === 'healthy') return 'bg-green';
    if (status === 'degraded' || status === 'warning') return 'bg-amber';
    return 'bg-red';
  };

  const getStatusText = (status) => {
    if (status === 'healthy') return 'SYSTEM OPERATIONAL';
    if (status === 'degraded' || status === 'warning') return 'SYSTEM DEGRADED';
    return 'SYSTEM OFFLINE';
  };

  return (
    <header className="flex h-[44px] shrink-0 items-center justify-between border-b border-line bg-sentinel-900 px-4">
      {/* Left section */}
      <div className="flex items-center space-x-2">
        <span className="text-sm font-semibold text-ink">SENTINEL</span>
        <span className="text-dim2 text-xs">//</span>
        <span className="text-xs tracking-wider text-dim">NORTHERN SECTOR</span>
      </div>

      {/* Center section */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 rounded bg-panel px-3 py-1 border border-line">
          <div className={`h-2 w-2 rounded-full ${getStatusColor(systemStatus)}`} />
          <span className="font-mono text-[11px] font-medium tracking-wider text-ink2">
            {getStatusText(systemStatus)}
          </span>
        </div>
        
        {isSimulation && (
          <div className="flex items-center rounded bg-amber/10 px-3 py-1 border border-amber/20">
            <span className="font-mono text-[11px] font-bold tracking-wider text-amber">
              ◉ SIMULATION MODE
            </span>
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center space-x-4">
        {/* Incidents Badge */}
        <div className="flex items-center space-x-2">
          <span className="font-mono text-[10px] text-dim">INCIDENTS</span>
          <span className={`font-mono text-xs ${activeIncidentsCount > 0 ? 'text-amber' : 'text-ink2'}`}>
            {activeIncidentsCount}
          </span>
        </div>

        <div className="h-4 w-px bg-line" />

        {/* Camera Health */}
        <div className="flex items-center space-x-2">
          <span className="font-mono text-[10px] text-dim">CAMERAS</span>
          <span className={`font-mono text-xs ${camerasOnline === camerasTotal && camerasTotal > 0 ? 'text-green' : 'text-amber'}`}>
            {camerasOnline}/{camerasTotal}
          </span>
        </div>

        <div className="h-4 w-px bg-line" />

        {/* Live Clock */}
        <span className="font-mono text-xs text-ink2 w-[180px] text-right">
          {formatDate(time)}
        </span>

        {/* Connection Indicator */}
        <div className={`h-2 w-2 rounded-full ml-2 ${connectionStatus === 'online' ? 'bg-green' : 'bg-red'}`} title={connectionStatus === 'online' ? 'Connected' : 'Disconnected'} />
      </div>
    </header>
  );
}