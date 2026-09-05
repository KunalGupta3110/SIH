import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Shield, Activity, Map, Video, AlertTriangle, 
  GitBranch, BarChart3, Lock, Settings 
} from 'lucide-react';

const navGroups = [
  {
    label: 'OPS',
    items: [
      { to: '/', icon: Activity, label: 'Live Operations' },
      { to: '/map', icon: Map, label: 'Map' },
    ]
  },
  {
    label: 'SURVEILLANCE',
    items: [
      { to: '/cameras', icon: Video, label: 'Cameras' },
    ]
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { to: '/incidents', icon: AlertTriangle, label: 'Incidents' },
      { to: '/reconstruction', icon: GitBranch, label: 'Reconstruction' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    ]
  },
  {
    label: 'EVIDENCE',
    items: [
      { to: '/evidence', icon: Lock, label: 'Evidence Vault' },
    ]
  },
  {
    label: 'SYSTEM',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ]
  },
];

export default function TacticalSidebar() {
  return (
    <aside className="group flex h-full w-[56px] hover:w-[220px] flex-col overflow-hidden border-r border-line bg-sentinel-800 transition-all duration-200 z-50">
      {/* Top Logo */}
      <div className="flex h-11 shrink-0 items-center px-4">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-panel-elevated">
          <Shield size={16} className="text-ink" />
        </div>
        <span className="ml-3 whitespace-nowrap font-semibold tracking-wider text-ink opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          SENTINEL
        </span>
      </div>

      {/* Nav Groups */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 no-scrollbar">
        {navGroups.map((group, i) => (
          <div key={i} className="mb-6">
            <div className="mb-2 px-4 h-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-dim opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {group.label}
              </span>
            </div>
            <nav className="flex flex-col gap-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `relative flex h-10 items-center px-4 transition-colors hover:bg-panel-hover ${
                      isActive ? 'bg-panel-hover text-ink' : 'text-dim hover:text-ink2'
                    }`
                  }
                  end={item.to === '/'}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <div className="absolute left-0 top-0 h-full w-[2px] bg-green" />
                      )}
                      <item.icon size={18} className="shrink-0" />
                      <span className="ml-3 whitespace-nowrap text-sm opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
      </div>

      {/* Bottom Version */}
      <div className="mt-auto flex h-12 shrink-0 items-center px-4">
        <span className="font-mono text-xs text-dim opacity-0 transition-opacity duration-200 group-hover:opacity-100 whitespace-nowrap">
          v1.0.0
        </span>
      </div>
    </aside>
  );
}