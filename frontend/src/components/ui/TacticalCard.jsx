import React from 'react';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {string} [props.title]
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.headerRight]
 * @param {boolean} [props.noPadding=false]
 */
export function TacticalCard({ 
  children, 
  className = '', 
  title, 
  subtitle, 
  headerRight, 
  noPadding = false 
}) {
  const hasHeader = title || subtitle || headerRight;

  return (
    <div className={`bg-panel border border-line rounded-sm overflow-hidden flex flex-col ${className}`}>
      {hasHeader && (
        <div className="px-3 py-2 border-b border-line flex justify-between items-start bg-panel-elevated">
          <div>
            {title && <h3 className="text-sm font-medium text-ink uppercase tracking-wider">{title}</h3>}
            {subtitle && <p className="text-xs text-dim mt-0.5">{subtitle}</p>}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className={`flex-1 ${noPadding ? '' : 'p-3'}`}>
        {children}
      </div>
    </div>
  );
}

export default TacticalCard;
