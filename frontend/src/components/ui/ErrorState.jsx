import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * @param {Object} props
 * @param {string} props.message
 * @param {function} [props.onRetry]
 */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center p-4 text-center h-full w-full bg-red/5 border border-red/10 rounded-sm">
      <AlertCircle className="text-red w-8 h-8 mb-2" />
      <p className="text-ink text-sm mb-3">{message}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="px-3 py-1 bg-panel-elevated border border-line hover:border-line2 text-ink text-xs rounded-sm transition-colors uppercase tracking-wider font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default ErrorState;
