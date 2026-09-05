import React from 'react';

/**
 * @param {Object} props
 * @param {'online' | 'warning' | 'offline' | 'fault'} props.status
 * @param {'sm' | 'md' | 'lg'} [props.size='md']
 * @param {boolean} [props.pulse=false]
 */
export function StatusIndicator({ status, size = 'md', pulse = false }) {
  const baseClasses = 'rounded-full inline-block shrink-0';
  
  const sizeMap = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5'
  };

  const colorMap = {
    online: 'bg-green',
    warning: 'bg-amber',
    offline: 'bg-red',
    fault: 'bg-red'
  };

  const pulseColorMap = {
    online: 'bg-green/50',
    warning: 'bg-amber/50',
    offline: 'bg-red/50',
    fault: 'bg-red/50'
  };

  const sizeClass = sizeMap[size] || sizeMap.md;
  const colorClass = colorMap[status] || colorMap.offline;
  
  if (pulse) {
    const pColor = pulseColorMap[status] || pulseColorMap.offline;
    return (
      <span className="relative flex items-center justify-center">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pColor} opacity-75`}></span>
        <span className={`relative inline-flex ${sizeClass} ${colorClass} ${baseClasses}`}></span>
      </span>
    );
  }

  return <span className={`${sizeClass} ${colorClass} ${baseClasses}`} />;
}

export default StatusIndicator;
