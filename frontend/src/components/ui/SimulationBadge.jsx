import React from 'react';
import { useSystem } from '../../contexts/SystemContext';

export function SimulationBadge() {
  const { isSimulation } = useSystem() || { isSimulation: false };

  if (!isSimulation) return null;

  return (
    <div className="flex items-center px-2 py-0.5 border border-amber/30 bg-amber/10 rounded-sm text-amber font-mono text-[10px] tracking-wider uppercase shrink-0">
      <span className="mr-1.5 w-1.5 h-1.5 rounded-full bg-amber animate-pulse"></span>
      SIMULATION MODE
    </div>
  );
}

export default SimulationBadge;
