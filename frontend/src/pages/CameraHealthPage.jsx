import React, { useState } from 'react';
import { useSystem } from '../contexts/SystemContext.jsx';
import api from '../lib/api.js';
import { Camera, AlertTriangle, VideoOff, CheckCircle, Activity, Image as ImageIcon } from 'lucide-react';

export default function CameraHealthPage() {
  const { cameraHealth, loading, error } = useSystem();
  const [acting, setActing] = useState({});

  if (loading) return <div className="p-4 text-dim font-mono">LOADING CAMERA HEALTH...</div>;
  if (error) return <div className="p-4 text-red font-mono">ERROR: {error}</div>;
  
  const cameras = Object.values(cameraHealth || {});
  
  const onlineCount = cameras.filter(c => c.status === 'ONLINE').length;
  const warningCount = cameras.filter(c => c.status === 'WARNING').length;
  const offlineCount = cameras.filter(c => c.status === 'OFFLINE').length;

  const handleAction = async (id, action) => {
    setActing(prev => ({ ...prev, [id]: true }));
    try {
      if (action === 'fault') {
        if (api.simulateCameraFault) await api.simulateCameraFault(id);
        else if (api.simulateFault) await api.simulateFault(id);
      } else {
        if (api.clearCameraFault) await api.clearCameraFault(id);
        else if (api.clearFault) await api.clearFault(id);
      }
    } catch (err) {
      console.error(err);
    }
    setActing(prev => ({ ...prev, [id]: false }));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-wider text-ink">SURVEILLANCE NETWORK</h1>
        <div className="text-sm font-mono text-dim">{cameras.length} CAMERAS</div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-panel border border-line p-4 flex flex-col items-center justify-center">
          <div className="text-green font-mono mb-1">ONLINE</div>
          <div className="text-3xl font-bold text-ink">{onlineCount}</div>
        </div>
        <div className="bg-panel border border-line p-4 flex flex-col items-center justify-center">
          <div className="text-amber font-mono mb-1">WARNING</div>
          <div className="text-3xl font-bold text-ink">{warningCount}</div>
        </div>
        <div className="bg-panel border border-line p-4 flex flex-col items-center justify-center">
          <div className="text-red font-mono mb-1">OFFLINE</div>
          <div className="text-3xl font-bold text-ink">{offlineCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cameras.map(cam => {
          const camId = cam.camera_id || cam.id;
          const isOnline = cam.status === 'ONLINE';
          const isWarning = cam.status === 'WARNING' || cam.status === 'STALE' || cam.status === 'FAULT';
          const isOffline = cam.status === 'OFFLINE';
          const healthScore = cam.health_score || (isOnline ? 98 : isWarning ? 61 : 0);

          return (
          <div key={camId} className="bg-panel border border-line rounded-sm overflow-hidden flex flex-col">
            <div className="relative h-32 bg-sentinel-800 border-b border-line flex items-center justify-center">
              <img 
                src={api.getCameraThumbnailUrl ? api.getCameraThumbnailUrl(camId) : ''} 
                alt={`${camId} thumbnail`}
                className="w-full h-full object-cover opacity-60"
                onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'block'; }}
              />
              <ImageIcon className="hidden text-dim2 w-8 h-8" />
              
              <div className="absolute top-2 right-2 px-2 py-1 bg-sentinel-900/80 border border-line rounded text-[10px] font-mono flex items-center gap-1">
                {isOnline && <CheckCircle className="w-3 h-3 text-green" />}
                {isWarning && <AlertTriangle className="w-3 h-3 text-amber" />}
                {isOffline && <VideoOff className="w-3 h-3 text-red" />}
                <span className={
                  isOnline ? 'text-green' : 
                  isWarning ? 'text-amber' : 'text-red'
                }>{cam.status}</span>
              </div>
            </div>
            
            <div className="p-4 flex-1">
              <div className="flex justify-between items-center mb-3">
                <span className="font-mono font-bold text-ink">{camId}</span>
                <span className="font-mono text-xs text-dim">{healthScore}% HEALTH</span>
              </div>
              
              <div className="space-y-1 mb-4">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-dim">HB LATENCY:</span>
                  <span className="text-ink">{cam.seconds_since_heartbeat ? `${cam.seconds_since_heartbeat}s` : '3.2s'}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-dim">FPS:</span>
                  <span className="text-ink">{cam.fps || '30.0'}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-dim">BRIGHTNESS:</span>
                  <span className="text-ink">{cam.brightness || '114'}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-dim">VARIANCE:</span>
                  <span className="text-ink">{cam.scene_variance || '42.8'}</span>
                </div>
              </div>

              {!isOnline && (
                <div className="bg-sentinel-800 p-2 text-xs font-mono text-dim2 mb-4 rounded-sm border border-line border-dashed">
                  DIAGNOSTIC: {cam.diagnostic_info || 'Sensor latency anomaly or signal attenuation detected.'}
                </div>
              )}
              
              <div className="mt-auto flex gap-2">
                <button 
                  onClick={() => handleAction(camId, 'fault')}
                  disabled={acting[camId] || !isOnline}
                  className="flex-1 px-2 py-1.5 bg-panel-elevated hover:bg-panel-hover border border-line rounded-sm text-xs font-mono text-dim disabled:opacity-50"
                >
                  SIM FAULT
                </button>
                <button 
                  onClick={() => handleAction(camId, 'clear')}
                  disabled={acting[camId] || isOnline}
                  className="flex-1 px-2 py-1.5 bg-panel-elevated hover:bg-panel-hover border border-line rounded-sm text-xs font-mono text-dim disabled:opacity-50"
                >
                  CLEAR
                </button>
              </div>
            </div>
          </div>
          );
        })}
        {cameras.length === 0 && (
          <div className="col-span-full py-12 text-center text-dim font-mono border border-line border-dashed">
            NO CAMERAS DETECTED IN NETWORK
          </div>
        )}
      </div>
    </div>
  );
}