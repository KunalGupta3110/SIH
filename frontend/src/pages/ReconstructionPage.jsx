import React, { useState } from 'react';
import { useSystem } from '../contexts/SystemContext.jsx';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api.js';
import { Activity, Play, Pause, ChevronLeft, GitMerge } from 'lucide-react';

export default function ReconstructionPage() {
  const { incidentId } = useParams();
  const { incidents, loading, error } = useSystem();
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  if (loading) return <div className="p-4 text-dim font-mono">LOADING RECONSTRUCTION...</div>;
  if (error) return <div className="p-4 text-red font-mono">ERROR: {error}</div>;

  if (!incidentId) {
    const multiCamIncs = (incidents || []).filter(i => (i.cameras_involved || i.cameras || []).length > 1);
    
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-xl font-bold tracking-wider text-ink flex items-center gap-2">
          <GitMerge className="w-5 h-5 text-blue" />
          INCIDENT RECONSTRUCTION
        </h1>
        <p className="text-sm font-mono text-dim">Select a multi-camera incident to view reconstruction.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {multiCamIncs.map(inc => {
            const incId = inc.incident_id || inc.id;
            const cams = inc.cameras_involved || inc.cameras || [];
            return (
              <Link key={incId} to={`/reconstruction/${incId}`} className="block">
                <div className="bg-panel border border-line hover:border-blue hover:bg-panel-hover p-4 rounded-sm transition-colors cursor-pointer h-full">
                  <div className="font-mono text-lg font-bold text-ink mb-2">{incId}</div>
                  <div className="text-xs font-mono text-dim space-y-1">
                    <div>Severity: <span className="text-ink">{inc.severity}</span></div>
                    <div>Cameras: <span className="text-ink">{cams.join(' → ')}</span></div>
                    <div>Score: <span className="text-amber">{inc.threat_score}</span></div>
                  </div>
                </div>
              </Link>
            );
          })}
          {multiCamIncs.length === 0 && (
            <div className="col-span-full py-8 text-center font-mono text-dim border border-line border-dashed">
              NO MULTI-CAMERA INCIDENTS AVAILABLE
            </div>
          )}
        </div>
      </div>
    );
  }

  const incident = (incidents || []).find(i => i.incident_id === incidentId || i.id === incidentId);
  if (!incident) return <div className="p-4 text-red font-mono">INCIDENT NOT FOUND</div>;

  const currentIncId = incident.incident_id || incident.id || incidentId;
  const cams = incident.cameras_involved || incident.cameras || ['CAM_UNKNOWN'];
  const cam1 = cams[0];
  const cam2 = cams[1] || cams[0];
  const incidentTime = incident.created_at || incident.timestamp || new Date().toISOString();

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-2">
        <Link to="/reconstruction" className="text-dim hover:text-ink">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold tracking-wider text-ink">
          INCIDENT RECONSTRUCTION — {currentIncId}
        </h1>
      </div>

      <div className="bg-panel border border-line p-4 rounded-sm">
        <div className="flex justify-between text-xs font-mono text-dim mb-2 uppercase">
          <span>TIMELINE SCRUBBER</span>
          <span>{new Date(incidentTime).toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 bg-sentinel-800 rounded-sm hover:bg-sentinel-700 text-ink">
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={progress} 
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full accent-blue bg-sentinel-800 h-2 rounded-sm appearance-none cursor-pointer" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-panel border border-line rounded-sm overflow-hidden">
          <div className="bg-sentinel-800 p-2 border-b border-line text-xs font-mono font-bold text-ink flex justify-between">
            <span>{cam1}</span>
            <span className={progress < 50 ? 'text-green' : 'text-dim'}>{progress < 50 ? 'ACTIVE' : 'IDLE'}</span>
          </div>
          <div className="relative h-64 bg-black flex items-center justify-center">
            <img 
              src={api.getCameraThumbnailUrl ? api.getCameraThumbnailUrl(cam1) : ''} 
              alt={cam1} 
              className={`w-full h-full object-cover ${progress < 50 ? 'opacity-100' : 'opacity-30'}`}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {progress < 50 && (
              <div className="absolute inset-0 border-2 border-blue/50 pointer-events-none"></div>
            )}
          </div>
          <div className="p-3 text-xs font-mono text-dim bg-sentinel-900 border-t border-line">
            {progress < 25 ? 'Subject detected.' : progress < 50 ? 'Subject moving toward zone boundary.' : 'Subject out of frame.'}
          </div>
        </div>

        <div className="bg-panel border border-line rounded-sm overflow-hidden">
          <div className="bg-sentinel-800 p-2 border-b border-line text-xs font-mono font-bold text-ink flex justify-between">
            <span>{cam2}</span>
            <span className={progress >= 50 ? 'text-green' : 'text-dim'}>{progress >= 50 ? 'ACTIVE' : 'IDLE'}</span>
          </div>
          <div className="relative h-64 bg-black flex items-center justify-center">
            <img 
              src={api.getCameraThumbnailUrl ? api.getCameraThumbnailUrl(cam2) : ''} 
              alt={cam2} 
              className={`w-full h-full object-cover ${progress >= 50 ? 'opacity-100' : 'opacity-30'}`}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {progress >= 50 && (
              <div className="absolute inset-0 border-2 border-amber/50 pointer-events-none"></div>
            )}
          </div>
          <div className="p-3 text-xs font-mono text-dim bg-sentinel-900 border-t border-line">
            {progress < 50 ? 'Awaiting handoff...' : progress < 75 ? 'Re-ID match. Subject acquired.' : 'Subject tracked.'}
          </div>
        </div>
      </div>

      <div className="bg-panel border border-line rounded-sm p-4 font-mono text-sm">
        <h3 className="text-xs text-dim uppercase mb-4 font-bold">EVENT SEQUENCE</h3>
        <div className="space-y-4 relative">
          <div className="absolute left-[39px] top-4 bottom-4 w-px bg-line"></div>
          
          <div className={`flex gap-4 relative z-10 ${progress >= 0 ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-20 text-right text-xs text-dim pt-1">{cam1}</div>
            <div className="w-3 h-3 rounded-full bg-blue border-2 border-panel mt-1"></div>
            <div className="flex-1 text-ink">Person detected</div>
          </div>
          
          <div className={`flex gap-4 relative z-10 ${progress >= 25 ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-20 text-right text-xs text-dim pt-1">{cam1}</div>
            <div className="w-3 h-3 rounded-full bg-blue border-2 border-panel mt-1"></div>
            <div className="flex-1 text-ink">Movement EAST toward boundary</div>
          </div>

          <div className={`flex gap-4 relative z-10 ${progress >= 50 ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-20 text-right text-xs text-blue font-bold pt-1">SYSTEM</div>
            <div className="w-3 h-3 rounded-full bg-amber border-2 border-panel mt-1 animate-pulse"></div>
            <div className="flex-1 text-amber font-bold">PREDICTED HANDOFF TO {cam2}</div>
          </div>

          <div className={`flex gap-4 relative z-10 ${progress >= 75 ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-20 text-right text-xs text-dim pt-1">{cam2}</div>
            <div className="w-3 h-3 rounded-full bg-blue border-2 border-panel mt-1"></div>
            <div className="flex-1 text-ink">Person detected - Re-ID MATCH 94%</div>
          </div>

          <div className={`flex gap-4 relative z-10 ${progress >= 100 ? 'opacity-100' : 'opacity-40'}`}>
            <div className="w-20 text-right text-xs text-red font-bold pt-1">CORRELATION</div>
            <div className="w-3 h-3 rounded-full bg-red border-2 border-panel mt-1"></div>
            <div className="flex-1 text-red font-bold">THREAT SCORE {incident.threat_score}</div>
          </div>
        </div>
      </div>
    </div>
  );
}