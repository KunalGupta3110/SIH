import React, { useState } from 'react';
import { useSystem } from '../contexts/SystemContext';
import { CameraListPanel } from '../components/camera/CameraListPanel';
import { ActiveIncidentPanel } from '../components/incidents/ActiveIncidentPanel';
import { CameraFeedGrid } from '../components/camera/CameraFeedGrid';
import { TacticalMap } from '../components/map/TacticalMap';
import { Radio } from 'lucide-react';

export function LiveOperations({ fullMap = false }) {
  const { cameraHealth, incidents } = useSystem();
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);

  const handleSelectCamera = (id) => {
    setSelectedCameraId(id);
    setSelectedIncidentId(null);
  };

  const handleSelectIncident = (id) => {
    setSelectedIncidentId(id);
    setSelectedCameraId(null);
  };

  if (fullMap) {
    return (
      <div className="w-full h-full bg-sentinel-900 text-ink">
        <TacticalMap 
          cameraHealth={cameraHealth} 
          incidents={incidents}
          selectedId={selectedCameraId || selectedIncidentId}
          onSelectCamera={handleSelectCamera}
          onSelectIncident={handleSelectIncident}
          className="w-full h-full"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-sentinel-900 text-ink overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center px-4 py-3 border-b border-line bg-panel shrink-0">
        <h1 className="text-xl font-bold tracking-wide">LIVE OPERATIONS</h1>
        <div className="flex items-center space-x-2 text-green">
          <Radio className="w-4 h-4 animate-pulse" />
          <span className="font-bold tracking-wider text-sm">LIVE</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[200px_1fr_280px] grid-rows-[1fr_auto] lg:grid-rows-[1fr_180px] min-h-0 overflow-hidden">
        
        {/* Left Panel - Cameras */}
        <div className="hidden lg:flex flex-col border-r border-line bg-panel-elevated overflow-y-auto row-span-1 col-start-1">
          <CameraListPanel 
            cameras={cameraHealth} 
            selectedCameraId={selectedCameraId}
            onSelectCamera={handleSelectCamera}
          />
        </div>

        {/* Center - Map */}
        <div className="relative border-b lg:border-b-0 lg:border-r border-line bg-sentinel-800 row-span-1 lg:col-start-2 min-h-[300px] overflow-hidden">
          <TacticalMap 
            cameraHealth={cameraHealth} 
            incidents={incidents}
            selectedId={selectedCameraId || selectedIncidentId}
            onSelectCamera={handleSelectCamera}
            onSelectIncident={handleSelectIncident}
            className="w-full h-full"
          />
        </div>

        {/* Right Panel - Incidents */}
        <div className="flex flex-col bg-panel-elevated overflow-y-auto row-span-1 lg:col-start-3 max-h-[300px] lg:max-h-none">
          <ActiveIncidentPanel 
            incidents={incidents} 
          />
        </div>

        {/* Bottom Panel - Feeds */}
        <div className="col-span-1 lg:col-span-3 border-t border-line bg-panel h-auto lg:h-full overflow-hidden flex flex-col row-start-2 lg:row-start-2">
           <CameraFeedGrid cameras={cameraHealth} />
        </div>
      </div>
    </div>
  );
}

export default LiveOperations;
