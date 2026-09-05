import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {boolean} [props.copyable=false]
 */
export function MonoLabel({ children, className = '', copyable = false }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!copyable || !children) return;
    navigator.clipboard.writeText(children.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const baseClasses = 'font-mono text-[10px] uppercase tracking-wider text-dim';
  
  if (copyable) {
    return (
      <button 
        onClick={handleCopy}
        className={`${baseClasses} hover:text-ink flex items-center gap-1 transition-colors ${className}`}
        title="Copy to clipboard"
      >
        <span>{children}</span>
        {copied ? <Check size={10} className="text-green" /> : <Copy size={10} />}
      </button>
    );
  }

  return (
    <span className={`${baseClasses} ${className}`}>
      {children}
    </span>
  );
}

export default MonoLabel;
