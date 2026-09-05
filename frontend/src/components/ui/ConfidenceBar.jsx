import React from 'react';

/**
 * @param {Object} props
 * @param {number} props.value
 * @param {boolean} [props.showLabel=false]
 * @param {'sm' | 'md'} [props.size='md']
 */
export function ConfidenceBar({ value, showLabel = false, size = 'md' }) {
  const normalizedValue = value <= 1 ? value * 100 : value;
  const clampedValue = Math.min(Math.max(normalizedValue, 0), 100);
  
  let colorClass = 'bg-green';
  if (clampedValue < 50) colorClass = 'bg-amber';
  else if (clampedValue < 80) colorClass = 'bg-blue';

  const heightClass = size === 'sm' ? 'h-1' : 'h-1.5';

  return (
    <div className="flex items-center gap-2 w-full">
      <div className={`w-full bg-sentinel-800 rounded-sm overflow-hidden ${heightClass}`}>
        <div 
          className={`h-full ${colorClass} transition-all duration-300`} 
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="font-mono text-[10px] text-dim shrink-0">
          {Math.round(clampedValue)}%
        </span>
      )}
    </div>
  );
}

export default ConfidenceBar;
