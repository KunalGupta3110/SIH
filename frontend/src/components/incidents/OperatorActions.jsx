import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Check, X, FileText, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function OperatorActions({ incident, onAction, onRefresh }) {
  const navigate = useNavigate();
  const [dismissMode, setDismissMode] = useState(false);
  const [dismissReason, setDismissReason] = useState('Animal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reasons = ['Animal', 'Vegetation', 'Rain/Fog', 'Shadow', 'Camera noise', 'Other'];

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await api.acknowledgeIncident(incident.id, 'CONFIRMED');
      if (onAction) onAction();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to confirm incident');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    try {
      setLoading(true);
      await api.acknowledgeIncident(incident.id, 'DISMISSED', dismissReason);
      setDismissMode(false);
      if (onAction) onAction();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to dismiss incident');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      setLoading(true);
      const url = await api.getDossierUrl(incident.id);
      window.open(url, '_blank');
    } catch (err) {
      setError(err.message || 'Failed to get dossier URL');
    } finally {
      setLoading(false);
    }
  };

  if (dismissMode) {
    return (
      <div className="flex flex-col gap-3 p-4 bg-panel-elevated border border-line rounded">
        <div className="text-sm font-medium text-ink">Select Dismiss Reason</div>
        <div className="grid grid-cols-2 gap-2">
          {reasons.map(reason => (
            <label key={reason} className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${dismissReason === reason ? 'border-amber bg-amber/10' : 'border-line2 hover:border-line'}`}>
              <input 
                type="radio" 
                name="reason" 
                value={reason} 
                checked={dismissReason === reason}
                onChange={() => setDismissReason(reason)}
                className="hidden"
              />
              <span className={`text-sm ${dismissReason === reason ? 'text-amber' : 'text-dim'}`}>{reason}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <button 
            onClick={handleDismiss} 
            disabled={loading}
            className="flex-1 bg-amber text-sentinel-900 font-medium py-2 rounded text-sm hover:bg-opacity-90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'PROCESSING...' : 'CONFIRM DISMISS'}
          </button>
          <button 
            onClick={() => setDismissMode(false)}
            disabled={loading}
            className="flex-1 bg-panel border border-line text-ink py-2 rounded text-sm hover:bg-panel-hover disabled:opacity-50 transition-colors"
          >
            CANCEL
          </button>
        </div>
        {error && <div className="text-red text-xs mt-1">{error}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {incident.status === 'ACTIVE' || incident.status === 'NEW' ? (
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 rounded border border-green text-green hover:bg-green/10 transition-colors disabled:opacity-50"
          >
            <Check size={16} />
            <span className="font-medium tracking-wider text-sm">CONFIRM</span>
          </button>
          <button 
            onClick={() => setDismissMode(true)}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 rounded border border-line2 text-dim hover:text-ink hover:border-line transition-colors disabled:opacity-50"
          >
            <X size={16} />
            <span className="font-medium tracking-wider text-sm">DISMISS</span>
          </button>
        </div>
      ) : (
        <div className="p-3 bg-panel border border-line2 rounded text-center text-sm text-dim">
          Incident marked as {incident.status}
        </div>
      )}

      <button 
        onClick={handleDownload}
        disabled={loading}
        className="flex items-center justify-center gap-2 py-2 rounded border border-blue text-blue hover:bg-blue/10 transition-colors disabled:opacity-50 w-full"
      >
        <FileText size={16} />
        <span className="font-medium tracking-wider text-sm uppercase">Download Dossier</span>
      </button>

      <button 
        onClick={() => navigate(`/reconstruction/${incident.id}`)}
        className="flex items-center justify-center gap-2 py-2 rounded border border-line2 text-dim hover:text-ink hover:border-line transition-colors w-full"
      >
        <Activity size={16} />
        <span className="font-medium tracking-wider text-sm uppercase">Follow Track</span>
      </button>
      
      {error && <div className="text-red text-xs mt-1">{error}</div>}
    </div>
  );
}
