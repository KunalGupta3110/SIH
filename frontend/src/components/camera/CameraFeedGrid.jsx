import React from 'react';
import { CameraFeedCard } from './CameraFeedCard';

export function CameraFeedGrid({ cameras = {} }) {
  const cameraList = Object.values(cameras);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="px-4 py-1.5 border-b border-line bg-panel-hover flex justify-between items-center shrink-0">
        <h2 className="uppercase tracking-wider text-[10px] text-dim2 font-bold">Live Camera Feeds</h2>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-2 flex space-x-2">
        {cameraList.map(cam => (
          <div key={cam.camera_id} className="w-[280px] shrink-0 h-full">
            <CameraFeedCard camera={cam} />
          </div>
        ))}
        {cameraList.length === 0 && (
          <div className="flex items-center justify-center w-full h-full text-dim">
            No camera feeds available.
          </div>
        )}
      </div>
    </div>
  );
}
