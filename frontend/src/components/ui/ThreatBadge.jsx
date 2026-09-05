import React from 'react';

/**
 * @param {Object} props
 * @param {'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'} props.severity
 * @param {string} [props.className]
 */
export function ThreatBadge({ severity, className = '' }) {
  const badgeMap = {
    CRITICAL: 'badge-critical',
    HIGH: 'badge-high',
    MEDIUM: 'badge-medium',
    LOW: 'badge-low',
    INFO: 'badge-low'
  };

  const badgeClass = badgeMap[severity] || 'badge-low';

  return (
    <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-wider uppercase ${badgeClass} ${className}`}>
      {severity}
    </span>
  );
}

export default ThreatBadge;
