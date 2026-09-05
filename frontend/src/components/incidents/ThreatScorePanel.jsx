import React from 'react';
import { ThreatBadge } from '../ui/ThreatBadge';
import { ConfidenceBar } from '../ui/ConfidenceBar';
import { MonoLabel } from '../ui/MonoLabel';
import { Check } from 'lucide-react';

export function ThreatScorePanel({ threatScore, severity, confidence, scoreBreakdown = [], nodes = [] }) {
  // Derive checklist from nodes or breakdown
  const checklist = [
    { label: 'Person detected', checked: nodes.some(n => n.event_type === 'DETECTION') },
    { label: 'Track maintained', checked: nodes.length > 1 },
    { label: 'Zone crossed', checked: nodes.some(n => n.event_type === 'ZONE_ENTRY') },
    { label: 'Camera handoff', checked: nodes.some(n => n.event_type === 'PREDICTIVE_HANDOFF') },
    { label: 'Re-ID match', checked: nodes.some(n => n.event_type === 'RE_IDENTIFICATION') }
  ];

  const getArcColor = (score) => {
    if (score >= 80) return '#D6534A';
    if (score >= 50) return '#E8A33D';
    return '#5C93B8';
  };
  
  const arcStroke = getArcColor(threatScore);
  const strokeDasharray = `${(threatScore / 100) * 283} 283`;

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center gap-6">
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
            <circle cx="50" cy="50" r="45" fill="transparent" stroke="#262B30" strokeWidth="8" />
            <circle cx="50" cy="50" r="45" fill="transparent" stroke={arcStroke} strokeWidth="8" strokeDasharray={strokeDasharray} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-mono text-ink">{threatScore}</span>
            <span className="text-[10px] text-dim uppercase tracking-wider">Score</span>
          </div>
        </div>
        
        <div className="flex flex-col gap-2">
          <ThreatBadge severity={severity} size="lg" />
          <div className="text-sm text-dim mt-1">Multi-factor risk assessment based on behavioral anomalies and rule violations.</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-dim mb-2">Score Breakdown</div>
          <div className="space-y-3">
            {scoreBreakdown.map((item, idx) => (
              <div key={idx} className="bg-panel-elevated border border-line rounded p-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-ink">{item.factor}</span>
                  <MonoLabel className={item.points > 0 ? "text-red" : "text-green"}>
                    {item.points > 0 ? `+${item.points}` : item.points}
                  </MonoLabel>
                </div>
                <div className="text-xs text-dim">{item.reason}</div>
              </div>
            ))}
            {scoreBreakdown.length === 0 && (
              <div className="text-xs text-dim italic">No breakdown available.</div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-dim">Confidence</div>
            <MonoLabel>{(confidence * 100).toFixed(0)}%</MonoLabel>
          </div>
          <ConfidenceBar confidence={confidence} />
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-dim mb-2">Supporting Evidence</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checklist.map((item, idx) => (
              <div key={idx} className={`flex items-center gap-2 text-sm ${item.checked ? 'text-ink2' : 'text-dim2 opacity-50'}`}>
                {item.checked ? (
                  <div className="text-green"><Check size={14} /></div>
                ) : (
                  <div className="text-line2"><Check size={14} /></div>
                )}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
