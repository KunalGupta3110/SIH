import React from 'react';
import { Camera, AlertCircle, CheckCircle, Clock } from 'lucide-react';

const StatusIndicator = ({ status }) => {
  if (status === 'ONLINE' || status === 'active') {
    return <span className="w-2 h-2 rounded-full bg-green inline-block shadow-[0_0_8px_rgba(76,154,106,0.5)]" />;
  }
  if (status === 'OFFLINE') {
    return <span className="w-2 h-2 rounded-full bg-red inline-block shadow-[0_0_8px_rgba(214,83,74,0.5)]" />;
  }
  return <span className="w-2 h-2 rounded-full bg-amber inline-block shadow-[0_0_8px_rgba(232,163,61,0.5)]" />;
};

export function CameraListPanel({ cameras = {}, selectedCameraId, onSelectCamera }) {
  const cameraList = Object.values(cameras);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-line bg-panel-hover sticky top-0">
        <h2 className="uppercase tracking-wider text-[10px] text-dim2 font-bold">Cameras ({cameraList.length})</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {cameraList.map((cam) => {
          const isSelected = selectedCameraId === cam.camera_id;
          return (
            <button
              key={cam.camera_id}
              onClick={() => onSelectCamera && onSelectCamera(cam.camera_id)}
              className={`w-full text-left px-3 py-2 rounded-sm flex items-center justify-between transition-colors
                ${isSelected ? 'bg-panel-hover border border-line text-ink' : 'bg-transparent border border-transparent text-ink2 hover:bg-panel hover:text-ink'}`}
            >
              <div className="flex items-center space-x-3">
                <StatusIndicator status={cam.status} />
                <span className="font-mono text-sm">{cam.camera_id}</span>
              </div>
            </button>
          );
        })}
        {cameraList.length === 0 && (
          <div className="p-4 text-center text-dim text-sm">
            No cameras available.
          </div>
        )}
      </div>
    </div>
  );
}
