import React, { useState } from 'react';
import api from '../../lib/api';
import { CameraOff, Scan } from 'lucide-react';

export function CameraFeedCard({ camera, onToggleDetection, className = '' }) {
  const [error, setError] = useState(false);
  const [detectionEnabled, setDetectionEnabled] = useState(false);

  const feedUrl = api.getCameraFeedUrl ? api.getCameraFeedUrl(camera.camera_id) : `/api/cameras/${camera.camera_id}/feed`;

  const isOffline = camera.status === 'OFFLINE' || error;

  return (
    <div className={`relative w-full h-full bg-sentinel-900 border border-line rounded-sm overflow-hidden flex flex-col ${className}`}>
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center group">
        {!isOffline ? (
          <img 
            src={feedUrl} 
            alt={`Feed from ${camera.camera_id}`}
            className="w-full h-full object-cover"
            onError={() => setError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-dim space-y-2">
            <CameraOff className="w-8 h-8 opacity-50" />
            <span className="text-xs tracking-wider">STREAM UNAVAILABLE</span>
          </div>
        )}

        {/* Top overlays */}
        <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-start pointer-events-none bg-gradient-to-b from-black/60 to-transparent">
          <div className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-sm font-mono text-xs text-ink font-semibold">
            {camera.camera_id}
          </div>
          {!isOffline && (
            <div className="flex items-center space-x-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-sm text-green">
              <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
              <span className="text-[10px] font-bold tracking-wider">LIVE</span>
            </div>
          )}
        </div>

        {/* Bottom overlays */}
        <div className="absolute bottom-0 left-0 right-0 p-2 flex justify-between items-end bg-gradient-to-t from-black/60 to-transparent">
          <div className="pointer-events-auto">
             <button
               onClick={() => {
                 setDetectionEnabled(!detectionEnabled);
                 if (onToggleDetection) onToggleDetection(camera.camera_id, !detectionEnabled);
               }}
               className={`p-1 rounded-sm transition-colors ${detectionEnabled ? 'bg-amber/20 text-amber border border-amber/30' : 'bg-black/40 text-ink border border-line hover:bg-black/60'}`}
               title="Toggle YOLO Detection"
             >
               <Scan className="w-3.5 h-3.5" />
             </button>
          </div>
          <div className="px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-sm font-mono text-[10px] text-ink2 pointer-events-none">
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}
