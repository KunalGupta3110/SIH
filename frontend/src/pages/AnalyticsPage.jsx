import React from 'react';
import { useSystem } from '../contexts/SystemContext.jsx';
import { Activity, Camera, AlertOctagon, Target } from 'lucide-react';

export default function AnalyticsPage() {
  const { incidents, calibration, cameraHealth, loading } = useSystem();

  if (loading) return <div className="p-4 text-dim font-mono">LOADING ANALYTICS...</div>;

  const incList = incidents || [];
  const cameras = Object.values(cameraHealth || {});
  const onlineCams = cameras.filter(c => c.status === 'ONLINE').length;
  
  const totalIncidents = incList.length;
  const avgThreat = totalIncidents > 0 
    ? Math.round(incList.reduce((acc, curr) => acc + (curr.threat_score || 0), 0) / totalIncidents) 
    : 0;

  const calibrationData = calibration || { total_dismissed: 4, by_reason: { vegetation: 2, animal: 1, camera_noise: 1, weather: 0, other: 0 } };
  const totalDismissed = calibrationData.total_dismissed ?? 4;
  const byReason = calibrationData.by_reason || { vegetation: 2, animal: 1, camera_noise: 1, weather: 0, other: 0 };
  const overallFPRate = totalIncidents > 0 ? Math.round((totalDismissed / (totalIncidents + totalDismissed)) * 100) : 38;

  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  incList.forEach(inc => {
    const sev = (inc.severity || 'LOW').toUpperCase();
    if (severityCounts[sev] !== undefined) {
      severityCounts[sev]++;
    } else {
      severityCounts.LOW++;
    }
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold tracking-wider text-ink">OPERATIONAL ANALYTICS</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-panel border border-line p-4 rounded-sm">
          <div className="flex items-center gap-2 text-dim font-mono text-xs mb-2">
            <Activity className="w-4 h-4" /> TOTAL INC
          </div>
          <div className="text-3xl font-bold text-ink">{totalIncidents}</div>
        </div>
        <div className="bg-panel border border-line p-4 rounded-sm">
          <div className="flex items-center gap-2 text-dim font-mono text-xs mb-2">
            <AlertOctagon className="w-4 h-4" /> AVG THREAT
          </div>
          <div className="text-3xl font-bold text-amber">{avgThreat}</div>
        </div>
        <div className="bg-panel border border-line p-4 rounded-sm">
          <div className="flex items-center gap-2 text-dim font-mono text-xs mb-2">
            <Camera className="w-4 h-4" /> CAMERAS
          </div>
          <div className="text-3xl font-bold text-ink">{onlineCams}/{cameras.length || 0}</div>
        </div>
        <div className="bg-panel border border-line p-4 rounded-sm">
          <div className="flex items-center gap-2 text-dim font-mono text-xs mb-2">
            <Target className="w-4 h-4" /> FALSE POS
          </div>
          <div className="text-3xl font-bold text-red">{overallFPRate}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-panel border border-line p-4 rounded-sm">
          <h2 className="text-sm font-mono text-dim mb-4">Incidents Over Time</h2>
          <div className="h-48 flex items-end justify-between gap-2">
            {[4, 7, 2, 9, 5, 8, 12].map((val, i) => (
              <div key={i} className="w-full bg-sentinel-800 relative flex flex-col justify-end group h-full">
                <div 
                  className="w-full bg-blue transition-all duration-300" 
                  style={{ height: `${(val / 12) * 100}%` }}
                ></div>
                <div className="absolute bottom-0 left-0 w-full text-center text-[10px] font-mono text-ink mt-2 opacity-0 group-hover:opacity-100 bg-panel-elevated border border-line -mb-6 z-10">
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-panel border border-line p-4 rounded-sm">
          <h2 className="text-sm font-mono text-dim mb-4">Severity Dist</h2>
          <div className="h-48 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-32 h-32 transform -rotate-90">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1D2126" strokeWidth="20" />
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#D6534A" strokeWidth="20" strokeDasharray="250" strokeDashoffset={250 - (severityCounts.CRITICAL / (totalIncidents||1)) * 250} />
            </svg>
            <div className="ml-8 space-y-2 font-mono text-xs">
              <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red rounded-sm"></span> CRITICAL: {severityCounts.CRITICAL}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 bg-amber rounded-sm"></span> HIGH: {severityCounts.HIGH}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 bg-blue rounded-sm"></span> MEDIUM: {severityCounts.MEDIUM}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 bg-dim rounded-sm"></span> LOW: {severityCounts.LOW}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-panel border border-line rounded-sm p-4">
        <h2 className="text-sm font-mono text-dim mb-4 uppercase">SITE-SPECIFIC ALERT CALIBRATION</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {['CAM_ALPHA', 'CAM_BRAVO'].map((camId, idx) => {
            const valid = idx === 0 ? 62 : 78;
            const animal = idx === 0 ? byReason.animal || 21 : 12;
            const veg = idx === 0 ? byReason.vegetation || 11 : 6;
            const weather = idx === 0 ? byReason.weather || 6 : 4;
            const fp = 100 - valid;
            const needsCalib = fp > 30;
            const urgentCalib = fp > 50;

            return (
              <div key={camId} className="bg-sentinel-800 border border-line p-4 rounded-sm font-mono">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-ink text-base">{camId}</span>
                  <span className="text-xs text-dim">LAST 100 ALERTS</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs mb-3 border-y border-line py-2">
                  <div>VALID: <span className="text-green font-bold">{valid}</span></div>
                  <div>ANIMAL: <span className="text-amber font-bold">{animal}</span></div>
                  <div>VEGETATION: <span className="text-amber font-bold">{veg}</span></div>
                  <div>WEATHER: <span className="text-dim font-bold">{weather}</span></div>
                </div>

                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="text-dim">FALSE POSITIVE RATE:</span>
                  <span className={`font-bold ${urgentCalib ? 'text-red' : needsCalib ? 'text-amber' : 'text-green'}`}>
                    {fp}%
                  </span>
                </div>

                <div className={`text-xs font-bold ${urgentCalib ? 'text-red' : needsCalib ? 'text-amber' : 'text-green'}`}>
                  RECOMMENDATION: {urgentCalib ? 'Urgent calibration needed' : needsCalib ? 'Calibration required' : 'Sensors calibrated within parameters'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}