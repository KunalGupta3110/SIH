import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Activity } from 'lucide-react';

const ThreatBadge = ({ severity }) => {
  const colors = {
    CRITICAL: 'bg-red/10 text-red border-red/20',
    HIGH: 'bg-amber/10 text-amber border-amber/20',
    MEDIUM: 'bg-blue/10 text-blue border-blue/20',
    LOW: 'bg-dim2/10 text-dim border-line'
  };
  
  const c = colors[severity] || colors.LOW;
  return (
    <span className={`px-1.5 py-0.5 border rounded-sm text-[10px] font-bold tracking-wider uppercase ${c}`}>
      {severity}
    </span>
  );
};

export function ActiveIncidentPanel({ incidents = [] }) {
  // Filter for unconfirmed, sort by threat_score desc
  const activeIncidents = incidents
    .filter(inc => inc.status === 'UNCONFIRMED')
    .sort((a, b) => (b.threat_score || 0) - (a.threat_score || 0));

  return (
    <div className="flex flex-col h-full border-l border-line bg-panel-elevated">
      <div className="px-4 py-2 border-b border-line flex justify-between items-center sticky top-0 bg-panel-hover">
        <h2 className="uppercase tracking-wider text-[10px] text-dim2 font-bold flex items-center">
          <AlertTriangle className="w-3 h-3 mr-1.5" />
          Active Incidents
        </h2>
        <span className="text-xs font-mono bg-panel px-1.5 py-0.5 rounded text-ink2">
          {activeIncidents.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {activeIncidents.map(incident => (
          <Link
            key={incident.incident_id}
            to={`/incidents/${incident.incident_id}`}
            className="block p-3 rounded-sm border border-line bg-panel hover:bg-panel-hover hover:border-line2 transition-all group"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm text-ink group-hover:text-amber transition-colors">
                  {incident.incident_id}
                </span>
                <span className="w-2 h-2 rounded-full bg-amber animate-pulse shadow-[0_0_8px_rgba(232,163,61,0.5)]" />
              </div>
              <ThreatBadge severity={incident.severity} />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="flex flex-col">
                <span className="uppercase tracking-wider text-[9px] text-dim2">Threat Score</span>
                <span className="font-mono text-lg text-ink font-light">
                  {Math.round((incident.threat_score || 0) * 100)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="uppercase tracking-wider text-[9px] text-dim2">Confidence</span>
                <span className="font-mono text-lg text-ink font-light">
                  {Math.round((incident.confidence || 0) * 100)}%
                </span>
              </div>
            </div>

            {incident.cameras && incident.cameras.length > 0 && (
              <div className="mb-2">
                 <span className="uppercase tracking-wider text-[9px] text-dim2 block mb-1">Path</span>
                 <div className="font-mono text-xs text-ink2 flex items-center flex-wrap gap-1">
                   {incident.cameras.map((c, i) => (
                     <React.Fragment key={c}>
                       <span>{c}</span>
                       {i < incident.cameras.length - 1 && <ChevronRight className="w-3 h-3 text-dim" />}
                     </React.Fragment>
                   ))}
                 </div>
              </div>
            )}

            {incident.story_summary && (
              <div className="text-xs text-dim line-clamp-2 mt-2">
                {incident.story_summary}
              </div>
            )}
          </Link>
        ))}

        {activeIncidents.length === 0 && (
          <div className="p-6 flex flex-col items-center justify-center text-center text-dim space-y-3 mt-10">
            <Activity className="w-8 h-8 opacity-20" />
            <p className="text-sm">All monitored zones currently within expected parameters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
