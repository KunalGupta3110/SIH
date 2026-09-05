import React from 'react';

export function IncidentGraph({ incident }) {
  if (!incident) return null;

  const cameras = Array.from(new Set((incident.nodes || []).map(n => n.camera_id).filter(Boolean)));
  const events = incident.nodes || [];
  
  return (
    <div className="w-full h-full flex items-center justify-center p-4 min-h-[300px] overflow-hidden bg-sentinel-800 rounded">
      <svg className="w-full h-full min-w-[500px]" viewBox="0 0 800 400">
        <defs>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#5C93B8" />
          </marker>
          <marker id="arrow-amber" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#E8A33D" />
          </marker>
          <marker id="arrow-green" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4C9A6A" />
          </marker>
        </defs>

        {/* Target Node */}
        <g transform="translate(400, 40)">
          <circle r="25" fill="#161A1E" stroke="#1D2126" strokeWidth="2" />
          <text textAnchor="middle" y="5" className="fill-ink text-xs font-mono">TARGET</text>
          <text textAnchor="middle" y="45" className="fill-dim text-[10px] uppercase tracking-wider">{incident.target_class || 'UNKNOWN'}</text>
        </g>

        {/* Camera Nodes */}
        {cameras.map((cam, i) => {
          const x = 400 + (i - (cameras.length - 1) / 2) * 150;
          const y = 140;
          return (
            <g key={cam}>
              <path d={`M 400 65 L ${x} ${y - 20}`} stroke="#5C93B8" strokeWidth="1" strokeDasharray="4,4" markerEnd="url(#arrow-blue)" />
              <g transform={`translate(${x}, ${y})`}>
                <rect x="-30" y="-15" width="60" height="30" rx="4" fill="#161A1E" stroke="#5C93B8" strokeWidth="1" />
                <text textAnchor="middle" y="4" className="fill-blue text-xs font-mono">{cam}</text>
              </g>
            </g>
          );
        })}

        {/* Event Nodes */}
        {events.map((ev, i) => {
          const x = 400 + (i - (events.length - 1) / 2) * 120;
          const y = 260;
          const camIndex = cameras.indexOf(ev.camera_id);
          const camX = camIndex >= 0 ? 400 + (camIndex - (cameras.length - 1) / 2) * 150 : 400;
          const camY = 155;
          return (
            <g key={i}>
              {ev.camera_id && (
                <path d={`M ${camX} ${camY} L ${x} ${y - 20}`} stroke="#E8A33D" strokeWidth="1" strokeOpacity="0.5" markerEnd="url(#arrow-amber)" />
              )}
              <g transform={`translate(${x}, ${y})`}>
                <circle r="18" fill="#161A1E" stroke="#E8A33D" strokeWidth="1" />
                <text textAnchor="middle" y="4" className="fill-amber text-[8px] font-mono">{ev.event_type?.substring(0,4)}</text>
              </g>
              <path d={`M ${x} ${y + 18} L 400 350`} stroke="#4C9A6A" strokeWidth="1" strokeOpacity="0.5" markerEnd="url(#arrow-green)" />
            </g>
          );
        })}

        {/* Incident Node */}
        <g transform="translate(400, 370)">
          <rect x="-50" y="-15" width="100" height="30" rx="4" fill="#161A1E" stroke="#4C9A6A" strokeWidth="2" />
          <text textAnchor="middle" y="4" className="fill-green text-sm font-mono">{incident.id}</text>
        </g>
      </svg>
    </div>
  );
}
