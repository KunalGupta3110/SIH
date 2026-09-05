import React, { useState } from 'react';
import { useSystem } from '../contexts/SystemContext.jsx';
import api from '../lib/api.js';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ChevronDown, ChevronRight, Target } from 'lucide-react';

export default function IncidentsPage() {
  const { incidents, loading, error } = useSystem();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const res = await (api.retrospectiveQuery ? api.retrospectiveQuery(search) : { results: [] });
      setSearchResults(res.results || []);
    } catch (err) {
      console.error(err);
    }
    setIsSearching(false);
  };

  if (loading) return <div className="p-4 text-dim font-mono">LOADING INCIDENTS...</div>;
  if (error) return <div className="p-4 text-red font-mono">ERROR: {error}</div>;

  let displayData = searchResults || incidents || [];
  
  if (filter !== 'ALL' && !searchResults) {
    displayData = displayData.filter(inc => {
      if (filter === 'ACTIVE') return inc.status === 'UNCONFIRMED' || inc.status === 'ACTIVE';
      if (filter === 'CONFIRMED') return inc.status === 'CONFIRMED';
      if (filter === 'DISMISSED') return inc.status === 'DISMISSED_FP';
      return true;
    });
  }

  const toggleExpand = (id, e) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-wider text-ink flex items-center gap-2">
          <Target className="w-5 h-5 text-blue" />
          INCIDENTS
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-dim mr-2 flex items-center gap-1">
            <Filter className="w-3 h-3" /> FILTER:
          </span>
          {['ALL', 'ACTIVE', 'CONFIRMED', 'DISMISSED'].map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSearchResults(null); }}
              className={`px-2 py-1 text-xs font-mono border rounded-sm ${
                filter === f 
                  ? 'bg-blue/20 border-blue text-blue' 
                  : 'bg-panel border-line text-dim hover:bg-panel-hover'
              }`}
            >
              [{f}]
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dim" />
          <input 
            type="text" 
            placeholder="Search ID, camera, or retrospective query..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-panel border border-line rounded-sm py-2 pl-9 pr-3 text-sm font-mono text-ink focus:outline-none focus:border-blue"
          />
        </div>
        <button 
          type="submit"
          disabled={isSearching}
          className="px-4 py-2 bg-panel border border-line rounded-sm font-mono text-sm hover:bg-panel-hover disabled:opacity-50"
        >
          {isSearching ? 'SEARCHING...' : 'SEARCH'}
        </button>
      </form>

      <div className="border border-line rounded-sm overflow-hidden bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-sm">
            <thead className="bg-sentinel-800 border-b border-line text-dim text-xs uppercase">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="p-3 cursor-pointer hover:text-ink">ID</th>
                <th className="p-3 cursor-pointer hover:text-ink">Time</th>
                <th className="p-3 cursor-pointer hover:text-ink">Status</th>
                <th className="p-3 cursor-pointer hover:text-ink">Severity</th>
                <th className="p-3 cursor-pointer hover:text-ink">Score</th>
                <th className="p-3 cursor-pointer hover:text-ink">Class</th>
                <th className="p-3 cursor-pointer hover:text-ink">Cameras</th>
                <th className="p-3 cursor-pointer hover:text-ink">Conf</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {displayData.map(inc => {
                const incId = inc.incident_id || inc.id;
                const incTime = inc.created_at || inc.timestamp || Date.now();
                const incClass = inc.target_class || inc.object_class || 'person';
                const incCams = inc.cameras_involved || inc.cameras || [];
                return (
                <React.Fragment key={incId}>
                  <tr 
                    className="hover:bg-panel-hover cursor-pointer group transition-colors"
                    onClick={() => navigate(`/incidents/${incId}`)}
                  >
                    <td className="p-3" onClick={(e) => toggleExpand(incId, e)}>
                      {expanded[incId] ? <ChevronDown className="w-4 h-4 text-dim group-hover:text-ink" /> : <ChevronRight className="w-4 h-4 text-dim group-hover:text-ink" />}
                    </td>
                    <td className="p-3 text-ink font-bold">{incId}</td>
                    <td className="p-3 text-dim">{new Date(incTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-sm text-[10px] ${
                        inc.status === 'ACTIVE' || inc.status === 'UNCONFIRMED' ? 'bg-amber/20 text-amber border border-amber/30' :
                        inc.status === 'CONFIRMED' ? 'bg-red/20 text-red border border-red/30' :
                        'bg-dim/20 text-dim border border-dim/30'
                      }`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="p-3 text-dim2">{inc.severity}</td>
                    <td className="p-3 text-ink">{inc.threat_score}</td>
                    <td className="p-3 text-dim2">{incClass}</td>
                    <td className="p-3 text-dim2 truncate max-w-[120px]">
                      {incCams.length > 0 ? incCams.join('→') : 'N/A'}
                    </td>
                    <td className="p-3 text-ink">{Math.round((inc.confidence || 0) * 100)}%</td>
                  </tr>
                  {expanded[incId] && (
                    <tr className="bg-sentinel-800/50">
                      <td colSpan="9" className="p-4 border-l-2 border-l-blue">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="text-dim mb-1 font-bold">SUMMARY</div>
                            <div className="text-ink whitespace-pre-wrap">{inc.story_summary || 'No summary available.'}</div>
                          </div>
                          <div>
                            <div className="text-dim mb-1 font-bold">SCORE BREAKDOWN</div>
                            <pre className="text-ink bg-sentinel-900 p-2 rounded-sm border border-line">
                              {JSON.stringify(inc.score_breakdown || {}, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })}
              {displayData.length === 0 && (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-dim italic">
                    No incidents matching filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}