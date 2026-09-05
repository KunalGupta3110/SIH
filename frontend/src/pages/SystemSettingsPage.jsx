import React, { useState } from 'react';
import { useSystem } from '../contexts/SystemContext.jsx';
import api from '../lib/api.js';
import { Settings, Shield, Network, Zap, Server, Power, Play } from 'lucide-react';

export default function SystemSettingsPage() {
  const { edgeStatus, networkStatus, isNetworkDown, loading, error } = useSystem();
  const [acting, setActing] = useState(false);

  const handleToggleArm = async () => {
    setActing(true);
    try {
      const newState = edgeStatus?.arm_state === 'ARMED' ? 'DISARMED' : 'ARMED';
      await (api.setArmState ? api.setArmState(newState) : Promise.resolve());
    } catch (e) {
      console.error(e);
    }
    setActing(false);
  };

  const handleToggleNetwork = async () => {
    setActing(true);
    try {
      await (api.toggleNetwork ? api.toggleNetwork() : Promise.resolve());
    } catch (e) {
      console.error(e);
    }
    setActing(false);
  };

  const handleSimulate = async (action, arg) => {
    setActing(true);
    try {
      if (action === 'handoff') {
        await (api.simulateHandoff ? api.simulateHandoff() : Promise.resolve());
      } else if (action === 'case') {
        await (api.simulateCase ? api.simulateCase(arg) : Promise.resolve());
      }
    } catch (e) {
      console.error(e);
    }
    setActing(false);
  };

  if (loading) return <div className="p-4 text-dim font-mono">LOADING SETTINGS...</div>;
  if (error) return <div className="p-4 text-red font-mono">ERROR: {error}</div>;

  const isArmed = edgeStatus?.arm_state === 'ARMED';
  const isOnline = !isNetworkDown && edgeStatus?.network_status !== 'OFFLINE';

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-xl font-bold tracking-wider text-ink flex items-center gap-2 mb-6">
        <Settings className="w-5 h-5 text-dim" />
        SYSTEM CONFIGURATION
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Edge Status */}
        <div className="bg-panel border border-line rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-2 text-dim font-mono text-sm uppercase mb-2">
            <Shield className="w-4 h-4" /> Edge Status
          </div>
          
          <div className="flex justify-between items-center bg-sentinel-800 p-3 rounded-sm border border-line">
            <span className="font-mono text-sm text-ink">ARM STATE</span>
            <span className={`font-mono font-bold ${isArmed ? 'text-red' : 'text-dim'}`}>
              {isArmed ? 'ARMED' : 'DISARMED'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-xs text-dim">
            <div className="bg-sentinel-800 p-2 rounded-sm border border-line flex justify-between">
              <span>HEALTH:</span> <span className="text-green">OPTIMAL</span>
            </div>
            <div className="bg-sentinel-800 p-2 rounded-sm border border-line flex justify-between">
              <span>FPS:</span> <span className="text-ink">{edgeStatus?.fps || 30}</span>
            </div>
          </div>

          <button 
            onClick={handleToggleArm}
            disabled={acting}
            className={`w-full py-2 flex items-center justify-center gap-2 font-mono text-sm border rounded-sm transition-colors ${
              isArmed 
                ? 'bg-red/10 border-red/30 text-red hover:bg-red/20' 
                : 'bg-panel-elevated border-line text-ink hover:bg-panel-hover'
            } disabled:opacity-50`}
          >
            <Power className="w-4 h-4" /> {isArmed ? 'DISARM SYSTEM' : 'ARM SYSTEM'}
          </button>
        </div>

        {/* Network Status */}
        <div className="bg-panel border border-line rounded-sm p-5 space-y-4">
          <div className="flex items-center gap-2 text-dim font-mono text-sm uppercase mb-2">
            <Network className="w-4 h-4" /> Network & Edge Operational Mode
          </div>
          
          <div className="flex justify-between items-center bg-sentinel-800 p-3 rounded-sm border border-line">
            <span className="font-mono text-sm text-ink">LINK STATUS</span>
            <span className={`font-mono font-bold ${isOnline ? 'text-green' : 'text-amber'}`}>
              {isOnline ? 'ONLINE · CLOUD SYNCED' : '⚠ NETWORK CONNECTION LOST · EDGE MODE'}
            </span>
          </div>

          {!isOnline ? (
            <div className="bg-amber/10 border border-amber/30 p-3 rounded-sm space-y-2 font-mono text-xs">
              <div className="text-amber font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber animate-pulse"></span>
                EDGE MODE ACTIVE (STANDALONE SURVEILLANCE)
              </div>
              <div className="grid grid-cols-2 gap-2 text-dim pt-1 border-t border-amber/20">
                <div>Local AI: <span className="text-green font-bold">● RUNNING</span></div>
                <div>Local DB: <span className="text-green font-bold">● RUNNING</span></div>
                <div>Acoustic Alerts: <span className="text-green font-bold">● RUNNING</span></div>
                <div>Cloud Sync: <span className="text-dim font-bold">○ PAUSED</span></div>
              </div>
              <div className="text-amber pt-1 text-[11px]">
                {networkStatus?.queued_events_count || 23} EVENTS QUEUED IN LOCAL STORAGE FOR SYNC
              </div>
            </div>
          ) : (
            <div className="bg-green/10 border border-green/30 p-3 rounded-sm space-y-1 font-mono text-xs text-green">
              <div className="font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green"></span>
                CENTRAL COMMAND CLOUD CONNECTED
              </div>
              <div className="text-dim text-[11px]">
                {networkStatus?.drained_events ? `${networkStatus.drained_events} / ${networkStatus.drained_events} EVENTS SYNCHRONIZED` : 'All edge events synchronized to central database'}
              </div>
            </div>
          )}

          <button 
            onClick={handleToggleNetwork}
            disabled={acting}
            className="w-full py-2 bg-panel-elevated border border-line hover:bg-panel-hover rounded-sm font-mono text-xs text-ink uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            {isOnline ? 'Simulate Network Disconnection (Edge Fallback)' : 'Restore Network Connection & Synchronize'}
          </button>
        </div>

        {/* Simulation Controls */}
        <div className="bg-panel border border-line rounded-sm p-5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 text-dim font-mono text-sm uppercase mb-2">
            <Zap className="w-4 h-4" /> Simulation Controls
          </div>
          <p className="text-xs text-dim font-mono">Use these controls to trigger test scenarios for the presentation.</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button 
              onClick={() => handleSimulate('handoff')}
              disabled={acting}
              className="py-2 px-3 bg-panel-elevated border border-line hover:bg-blue/10 hover:border-blue/30 rounded-sm font-mono text-xs text-ink flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3 h-3" /> SIM HANDOFF
            </button>
            
            {[1, 2, 3].map(n => (
              <button 
                key={n}
                onClick={() => handleSimulate('case', n)}
                disabled={acting}
                className="py-2 px-3 bg-panel-elevated border border-line hover:bg-amber/10 hover:border-amber/30 rounded-sm font-mono text-xs text-ink flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Play className="w-3 h-3" /> CASE 0{n}
              </button>
            ))}
          </div>
        </div>

        {/* System Info */}
        <div className="bg-panel border border-line rounded-sm p-5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 text-dim font-mono text-sm uppercase mb-2">
            <Server className="w-4 h-4" /> System Topology & Info
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            <div className="bg-sentinel-800 p-3 rounded-sm border border-line">
              <div className="text-dim mb-1">VERSION</div>
              <div className="text-ink">v2.1.0-RC4 (build 9a3f2b)</div>
            </div>
            <div className="bg-sentinel-800 p-3 rounded-sm border border-line">
              <div className="text-dim mb-1">TOPOLOGY</div>
              <div className="text-ink">MESH - 14 NODES</div>
            </div>
            <div className="bg-sentinel-800 p-3 rounded-sm border border-line">
              <div className="text-dim mb-1">BACKEND API</div>
              <div className="text-green">CONNECTED · 12ms</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}