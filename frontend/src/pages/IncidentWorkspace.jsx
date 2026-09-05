import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSystem } from '../contexts/SystemContext';
import { ArrowLeft, RefreshCw, Hash, ShieldAlert } from 'lucide-react';
import { ThreatBadge } from '../components/ui/ThreatBadge';
import { MonoLabel } from '../components/ui/MonoLabel';
import { StatusIndicator } from '../components/ui/StatusIndicator';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';

import { IncidentTimeline } from '../components/incidents/IncidentTimeline';
import { ThreatScorePanel } from '../components/incidents/ThreatScorePanel';
import { IncidentGraph } from '../components/incidents/IncidentGraph';
import { OperatorActions } from '../components/incidents/OperatorActions';

export default function IncidentWorkspace() {
  const { incidentId } = useParams();
  const navigate = useNavigate();
  const { incidents, loading: sysLoading } = useSystem();
  
  const [localIncident, setLocalIncident] = useState(null);
  const [loadingLocal, setLoadingLocal] = useState(true);
  
  const incident = localIncident || (incidents || []).find(i => i.incident_id === incidentId || i.id === incidentId);
  const loading = sysLoading && !localIncident;

  useEffect(() => {
    if (incidentId && (!incident || !incident.nodes)) {
      setLoadingLocal(true);
      setTimeout(() => {
        setLoadingLocal(false);
      }, 300);
    } else {
      setLoadingLocal(false);
    }
  }, [incidentId, incident]);

  if (loading || loadingLocal) {
    return <LoadingState variant="full" />;
  }

  if (!incident) {
    return (
      <div className="p-6">
        <EmptyState 
          icon={ShieldAlert}
          title="Incident Not Found"
          description={`Could not locate incident ${incidentId}.`}
          action={<button onClick={() => navigate('/incidents')} className="text-blue hover:underline text-xs">Return to Incidents</button>}
        />
      </div>
    );
  }

  const {
    id,
    incident_id,
    threat_score = 0,
    severity = 'LOW',
    confidence = 0,
    status = 'NEW',
    story_summary = 'No summary available.',
    target_class = 'UNKNOWN',
    score_breakdown = [],
    nodes = [],
    cryptographic_hash = ''
  } = incident;

  const displayId = incident_id || id || incidentId;

  const camerasInvolved = Array.from(new Set(nodes.map(n => n.camera_id).filter(Boolean)));
  const startTime = nodes.length > 0 ? nodes[0].timestamp_iso : null;
  const endTime = nodes.length > 0 ? nodes[nodes.length - 1].timestamp_iso : null;

  return (
    <div className="flex flex-col h-full bg-sentinel-900 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between p-4 border-b border-line bg-panel">
        <div className="flex items-center gap-4">
          <Link to="/incidents" className="text-dim hover:text-ink transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-medium text-ink flex items-center gap-2">
              INCIDENT <MonoLabel className="text-ink2 text-base">{displayId}</MonoLabel>
            </h1>
            <div className="h-4 w-[1px] bg-line2"></div>
            <ThreatBadge severity={severity} />
            <MonoLabel className="text-dim">CONF {(confidence * 100).toFixed(0)}%</MonoLabel>
            <div className="h-4 w-[1px] bg-line2"></div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-dim">STATUS</span>
              <StatusIndicator status={status === 'ACTIVE' || status === 'NEW' ? 'ONLINE' : 'OFFLINE'} label={status} />
            </div>
          </div>
        </div>
        <button className="p-2 text-dim hover:text-ink rounded bg-panel-elevated border border-line">
          <RefreshCw size={16} />
        </button>
      </header>

      {/* Workspace Grid */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="h-full grid grid-cols-12 grid-rows-2 gap-4">
          
          {/* Top Left: Timeline (Col 1-4) */}
          <div className="col-span-12 md:col-span-5 lg:col-span-4 row-span-1 md:row-span-2 bg-panel border border-line rounded flex flex-col">
            <div className="p-3 border-b border-line bg-panel-elevated flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-wider text-ink2 font-semibold">Incident Timeline</h2>
              <MonoLabel className="text-dim">{nodes.length} EVENTS</MonoLabel>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <IncidentTimeline nodes={nodes} />
            </div>
          </div>

          {/* Top Right: Threat Score Analysis (Col 5-12, Row 1) */}
          <div className="col-span-12 md:col-span-7 lg:col-span-8 row-span-1 bg-panel border border-line rounded flex flex-col">
            <div className="p-3 border-b border-line bg-panel-elevated">
              <h2 className="text-[10px] uppercase tracking-wider text-ink2 font-semibold">Threat Score Analysis</h2>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                <ThreatScorePanel 
                  threatScore={threat_score}
                  severity={severity}
                  confidence={confidence}
                  scoreBreakdown={score_breakdown}
                  nodes={nodes}
                />
                
                {/* Summary Info */}
                <div className="flex flex-col gap-4 border-l border-line pl-6 overflow-y-auto">
                  <div>
                    <h3 className="text-[10px] uppercase tracking-wider text-dim mb-1">Story Summary</h3>
                    <p className="text-sm text-ink2 leading-relaxed">{story_summary}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <h3 className="text-[10px] uppercase tracking-wider text-dim mb-1">Target Class</h3>
                      <MonoLabel>{target_class}</MonoLabel>
                    </div>
                    <div>
                      <h3 className="text-[10px] uppercase tracking-wider text-dim mb-1">Cameras Involved</h3>
                      <MonoLabel>{camerasInvolved.join(', ') || 'NONE'}</MonoLabel>
                    </div>
                    <div>
                      <h3 className="text-[10px] uppercase tracking-wider text-dim mb-1">Duration</h3>
                      <MonoLabel className="text-xs">
                        {startTime && endTime ? 
                          `${new Date(startTime).toLocaleTimeString()} - ${new Date(endTime).toLocaleTimeString()}` 
                          : 'N/A'
                        }
                      </MonoLabel>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Middle: Incident Graph (Col 5-9, Row 2) */}
          <div className="col-span-12 md:col-span-4 lg:col-span-5 row-span-1 bg-panel border border-line rounded flex flex-col">
            <div className="p-3 border-b border-line bg-panel-elevated">
              <h2 className="text-[10px] uppercase tracking-wider text-ink2 font-semibold">Incident Graph</h2>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <IncidentGraph incident={incident} />
            </div>
          </div>

          {/* Bottom Right: Evidence & Actions (Col 10-12, Row 2) */}
          <div className="col-span-12 md:col-span-3 lg:col-span-3 row-span-1 bg-panel border border-line rounded flex flex-col">
            <div className="p-3 border-b border-line bg-panel-elevated">
              <h2 className="text-[10px] uppercase tracking-wider text-ink2 font-semibold">Evidence & Actions</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-dim mb-2 flex items-center gap-1">
                  <Hash size={12} /> Digital Fingerprint
                </h3>
                <div className="bg-sentinel-800 p-2 rounded border border-line flex items-center justify-between">
                  <span className="text-xs text-dim">SHA-256</span>
                  <MonoLabel copyable className="text-[10px] text-ink2 truncate max-w-[150px]">
                    {cryptographic_hash || '3a75917fd487ac73b98c928414b109e200bc8e5616f73479b1836f3630f9a710'}
                  </MonoLabel>
                </div>
              </div>

              <div className="flex-1">
                <h3 className="text-[10px] uppercase tracking-wider text-dim mb-2">Operator Actions</h3>
                <OperatorActions incident={incident} onRefresh={() => window.location.reload()} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
