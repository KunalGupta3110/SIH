import React from 'react';

/**
 * @param {Object} props
 * @param {React.ElementType} [props.icon]
 * @param {string} props.title
 * @param {string} props.description
 * @param {React.ReactNode} [props.action]
 */
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center h-full w-full">
      {Icon && (
        <div className="w-12 h-12 bg-sentinel-800 rounded-full flex items-center justify-center mb-3">
          <Icon className="text-dim2 w-6 h-6" />
        </div>
      )}
      <h4 className="text-ink font-medium text-sm mb-1">{title}</h4>
      <p className="text-dim text-xs max-w-xs mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

export default EmptyState;
