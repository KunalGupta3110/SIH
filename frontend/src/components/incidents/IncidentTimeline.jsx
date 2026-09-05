import React from 'react';
import { MonoLabel } from '../ui/MonoLabel';
import { Activity, Camera, ArrowRight, Eye, ShieldAlert, Crosshair } from 'lucide-react';

export function IncidentTimeline({ nodes = [] }) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-dim text-sm italic py-8">
        No timeline data available.
      </div>
    );
  }

  const getEventIcon = (type) => {
    switch(type) {
      case 'ZONE_ENTRY': return <ShieldAlert size={14} />;
      case 'PREDICTIVE_HANDOFF': return <ArrowRight size={14} />;
      case 'RE_IDENTIFICATION': return <Eye size={14} />;
      case 'DETECTION': return <Crosshair size={14} />;
      default: return <Activity size={14} />;
    }
  };

  const getEventColor = (type) => {
    switch(type) {
      case 'ZONE_ENTRY': return 'bg-red text-red';
      case 'PREDICTIVE_HANDOFF': return 'bg-blue text-blue';
      case 'RE_IDENTIFICATION': return 'bg-amber text-amber';
      default: return 'bg-dim text-dim';
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '--:--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--:--:--';
    }
  };

  return (
    <div className="relative pl-4 pr-2 py-4 h-full overflow-y-auto">
      <div className="absolute top-0 bottom-0 left-24 w-[1px] bg-line2"></div>
      
      <div className="space-y-6">
        {nodes.map((node, idx) => (
          <div key={idx} className="relative flex items-start gap-4 animate-fade-in" style={{ animationDelay: `${idx * 0.1}s` }}>
            {/* Time */}
            <div className="w-16 flex-shrink-0 text-right pt-1">
              <MonoLabel className="text-dim">{formatTime(node.timestamp_iso)}</MonoLabel>
            </div>
            
            {/* Dot & Line Connector */}
            <div className="relative z-10 flex-shrink-0 mt-1">
              <div className={`w-3 h-3 rounded-full flex items-center justify-center ${getEventColor(node.event_type).split(' ')[0]} border border-sentinel-800`}>
                <div className="w-1.5 h-1.5 rounded-full bg-panel"></div>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 bg-panel-elevated border border-line rounded px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <div className={`flex items-center justify-center p-1 rounded-sm bg-panel border border-line ${getEventColor(node.event_type).split(' ')[1]}`}>
                  {getEventIcon(node.event_type)}
                </div>
                <MonoLabel>{node.camera_id || 'SYS'}</MonoLabel>
                <div className="text-xs uppercase tracking-wider text-ink2">{node.event_type?.replace(/_/g, ' ')}</div>
              </div>
              {node.rule_detail && (
                <div className="text-sm text-dim mt-1 ml-[34px]">
                  {node.rule_detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
