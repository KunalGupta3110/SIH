import React from 'react';
import { CAMERA_POSITIONS, positionForCamera, positionForIncident } from '../../lib/mapGeometry';

export function TacticalMap({ 
  cameraHealth = {}, 
  incidents = [], 
  selectedId = null, 
  onSelectCamera,
  onSelectIncident,
  className = '' 
}) {
  
  // Render Background Grid
  const renderGrid = () => {
    const lines = [];
    for(let i=0; i<100; i+=10) {
      lines.push(<line key={`v${i}`} x1={`${i}%`} y1="0" x2={`${i}%`} y2="100%" stroke="#1D2126" strokeWidth="1" />);
      lines.push(<line key={`h${i}`} x1="0" y1={`${i}%`} x2="100%" y2={`${i}%`} stroke="#1D2126" strokeWidth="1" />);
    }
    return <g className="opacity-50 pointer-events-none">{lines}</g>;
  };

  // Render Restricted Zone
  const renderZones = () => {
    return (
      <g>
        <path d="M 0 15 L 100 20 L 100 30 L 0 25 Z" fill="rgba(214,83,74,0.05)" className="pointer-events-none" />
        <line x1="0" y1="20" x2="100" y2="20" stroke="#D6534A" strokeWidth="0.2" strokeDasharray="1,1" className="pointer-events-none opacity-50" />
        <text x="50" y="19" fill="#D6534A" fontSize="2" opacity="0.5" textAnchor="middle" className="font-mono tracking-widest pointer-events-none">INTERNATIONAL BORDER</text>
      </g>
    );
  };

  // Helper to resolve real world camera positions
  const renderCameras = () => {
    return Object.values(cameraHealth).map(cam => {
      const pos = positionForCamera(cam.camera_id) || { x: 50, y: 50 }; // fallback
      let color = '#4C9A6A'; // green
      if (cam.status === 'OFFLINE') color = '#D6534A'; // red
      else if (cam.status !== 'ONLINE') color = '#E8A33D'; // amber

      const isSelected = selectedId === cam.camera_id;

      return (
        <g 
          key={`cam-${cam.camera_id}`} 
          transform={`translate(${pos.x}, ${pos.y})`}
          onClick={() => onSelectCamera && onSelectCamera(cam.camera_id)}
          className="cursor-pointer"
        >
          {isSelected && (
            <circle cx="0" cy="0" r="3" fill="none" stroke={color} strokeWidth="0.3" className="animate-pulse" />
          )}
          <circle cx="0" cy="0" r="1.2" fill="#101215" stroke={color} strokeWidth="0.4" />
          <circle cx="0" cy="0" r="0.4" fill={color} />
          
          <rect x="-3" y="1.8" width="6" height="2" fill="#101215" stroke="#1D2126" strokeWidth="0.1" rx="0.2" />
          <text x="0" y="3.3" fill="#E7E9EA" fontSize="1.2" textAnchor="middle" className="font-mono pointer-events-none">
            {cam.camera_id}
          </text>
        </g>
      );
    });
  };

  const renderIncidents = () => {
    const activeIncidents = incidents.filter(i => i.status === 'UNCONFIRMED');
    return activeIncidents.map(inc => {
      const pos = positionForIncident(inc) || { x: 50, y: 50 };
      const isSelected = selectedId === inc.incident_id;
      
      let color = '#5C93B8'; // blue
      if (inc.severity === 'CRITICAL') color = '#D6534A';
      else if (inc.severity === 'HIGH') color = '#E8A33D';

      return (
        <g 
          key={`inc-${inc.incident_id}`}
          transform={`translate(${pos.x}, ${pos.y})`}
          onClick={() => onSelectIncident && onSelectIncident(inc.incident_id)}
          className="cursor-pointer"
        >
          {isSelected && (
            <circle cx="0" cy="0" r="4" fill="none" stroke={color} strokeWidth="0.2" strokeDasharray="0.5,0.5" className="animate-[spin_4s_linear_infinite]" />
          )}
          <polygon points="0,-1.5 1.5,0 0,1.5 -1.5,0" fill={color} className={inc.severity === 'CRITICAL' ? 'animate-pulse' : ''} />
          
          <rect x="-4" y="-3.5" width="8" height="1.8" fill="rgba(16,18,21,0.8)" />
          <text x="0" y="-2.2" fill={color} fontSize="1.2" textAnchor="middle" className="font-mono font-bold pointer-events-none">
            {inc.incident_id}
          </text>
        </g>
      );
    });
  };

  return (
    <div className={`relative bg-sentinel-900 ${className}`}>
      {/* Compass / Label Overlay */}
      <div className="absolute top-4 right-4 pointer-events-none flex flex-col items-end opacity-70">
        <div className="flex items-center space-x-2 text-dim2 font-mono text-xs">
          <span className="tracking-widest">NORTHERN SECTOR</span>
          <div className="w-6 h-6 border border-dim2 rounded-full flex flex-col items-center justify-center text-[8px] relative">
            <span className="absolute top-0 text-red font-bold">N</span>
            <div className="w-px h-2 bg-red absolute top-1.5" />
          </div>
        </div>
      </div>

      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="block">
        {renderGrid()}
        {renderZones()}
        {renderCameras()}
        {renderIncidents()}
      </svg>
    </div>
  );
}
