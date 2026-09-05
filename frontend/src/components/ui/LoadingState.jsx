import React from 'react';

/**
 * @param {Object} props
 * @param {number} [props.lines=3]
 * @param {'card' | 'list' | 'full'} [props.variant='list']
 */
export function LoadingState({ lines = 3, variant = 'list' }) {
  if (variant === 'card') {
    return (
      <div className="bg-panel border border-line rounded-sm p-4 w-full h-32 flex flex-col gap-3 animate-pulse">
        <div className="h-4 bg-sentinel-700 rounded w-1/3"></div>
        <div className="flex-1 bg-sentinel-700 rounded w-full"></div>
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className="w-full h-full min-h-[200px] flex items-center justify-center animate-pulse">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-sentinel-700 border-t-dim rounded-full animate-spin"></div>
          <div className="text-dim text-xs font-mono uppercase tracking-wider">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div 
          key={i} 
          className="h-3 bg-sentinel-700 rounded-sm" 
          style={{ width: `${Math.max(60, 100 - i * 15)}%` }}
        />
      ))}
    </div>
  );
}

export default LoadingState;
