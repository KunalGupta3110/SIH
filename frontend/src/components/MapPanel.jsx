import { useState } from "react";
import SectionHeader from "./SectionHeader.jsx";

const NODES = [
  { id: "CAM_ALPHA", name: "Sector 4 North Checkpost", x: 120, y: 150, status: "ONLINE", distance_next: "26.3m to Bravo" },
  { id: "CAM_BRAVO", name: "BOP Bravo Eastern Perimeter", x: 340, y: 150, status: "ONLINE", distance_next: "34.0m to Charlie" },
  { id: "CAM_CHARLIE", name: "Corridor C Caution Zone", x: 560, y: 150, status: "ONLINE", distance_next: "18.5m to Delta" },
  { id: "CAM_DELTA", name: "Sector 4 South Gate", x: 740, y: 150, status: "ONLINE", distance_next: "Terminal" },
];

export default function MapPanel({ incidents }) {
  const [selectedNode, setSelectedNode] = useState(NODES[0]);
  const activeIncident = incidents?.[0];

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="2D Tactical Sector Schematic & Camera Topology"
        sub="Spatial layout of physical camera nodes, restricted red-zone polygons, and inter-node transit corridors."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Flat 2D SVG Sector Map */}
        <div className="rounded-[4px] border border-line bg-panel p-4 flex flex-col">
          <div className="mb-2 flex items-center justify-between text-[11px] font-mono text-dim">
            <span>SECTOR 4 · GURDASPUR BORDER SECTOR</span>
            <span className="text-amber">TOPOLOGY SCALE: 1:100</span>
          </div>

          <div className="w-full bg-[#080B10] rounded border border-line2/40 p-4 flex items-center justify-center">
            <svg viewBox="0 0 860 300" className="w-full h-auto">
              {/* International Border Line */}
              <line x1="40" y1="50" x2="820" y2="50" stroke="#ef4444" strokeWidth="2" strokeDasharray="8 4" />
              <text x="50" y="40" fill="#ef4444" fontSize="10" fontFamily="monospace" fontWeight="bold">
                INTERNATIONAL BORDER LINE (ZERO LINE)
              </text>

              {/* Red Zone Polygon Corridor */}
              <rect x="40" y="55" width="780" height="35" fill="rgba(239, 68, 68, 0.08)" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" />
              <text x="50" y="77" fill="#f87171" fontSize="9" fontFamily="monospace">
                100m RESTRICTED RED ZONE (IMMEDIATE CRITICAL ALARM)
              </text>

              {/* Patrol Road */}
              <line x1="40" y1="220" x2="820" y2="220" stroke="#334155" strokeWidth="12" />
              <line x1="40" y1="220" x2="820" y2="220" stroke="#eab308" strokeWidth="1.5" strokeDasharray="10 6" />
              <text x="50" y="244" fill="#64748b" fontSize="9" fontFamily="monospace">
                TACTICAL PATROL CORRIDOR ROAD
              </text>

              {/* Inter-camera transit corridor arrows & distances */}
              <path d="M 160 150 L 300 150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="210" y="140" fill="#f59e0b" fontSize="9.5" fontFamily="monospace" textAnchor="middle">
                26.3m (6.0–14.0s)
              </text>

              <path d="M 380 150 L 520 150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="430" y="140" fill="#f59e0b" fontSize="9.5" fontFamily="monospace" textAnchor="middle">
                34.0m (8.0–18.0s)
              </text>

              <path d="M 600 150 L 700 150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="650" y="140" fill="#f59e0b" fontSize="9.5" fontFamily="monospace" textAnchor="middle">
                18.5m (4.0–10.0s)
              </text>

              {/* Camera Nodes */}
              {NODES.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const hasAlert = activeIncident?.cameras_involved?.includes(node.id);

                return (
                  <g
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className="cursor-pointer"
                  >
                    {/* Camera FOV Cone */}
                    <polygon
                      points={`${node.x},${node.y} ${node.x - 45},${node.y - 70} ${node.x + 45},${node.y - 70}`}
                      fill={hasAlert ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.12)"}
                      stroke={hasAlert ? "#ef4444" : "#f59e0b"}
                      strokeWidth="1"
                    />

                    {/* Camera Icon Node Circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isSelected ? "14" : "11"}
                      fill={hasAlert ? "#ef4444" : isSelected ? "#f59e0b" : "#1e293b"}
                      stroke={isSelected ? "#ffffff" : "#475569"}
                      strokeWidth="2"
                    />

                    <text
                      x={node.x}
                      y={node.y + 3}
                      fill={isSelected || hasAlert ? "#0f172a" : "#94a3b8"}
                      fontSize="8"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {node.id.replace("CAM_", "")}
                    </text>

                    {/* Label */}
                    <text
                      x={node.x}
                      y={node.y + 24}
                      fill={isSelected ? "#f59e0b" : "#94a3b8"}
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {node.id}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Node Information Sidebar */}
        <div className="rounded-[4px] border border-line bg-panel p-4 flex flex-col justify-between">
          <div>
            <div className="border-b border-line pb-2.5 mb-3 font-mono text-[11px] font-bold uppercase tracking-wider text-amber">
              Selected Node Metadata
            </div>
            {selectedNode && (
              <div className="flex flex-col gap-2.5 font-mono text-[11.5px]">
                <div>
                  <span className="text-dim">Node ID: </span>
                  <span className="font-bold text-ink">{selectedNode.id}</span>
                </div>
                <div>
                  <span className="text-dim">Sector: </span>
                  <span className="text-ink">{selectedNode.name}</span>
                </div>
                <div>
                  <span className="text-dim">Status: </span>
                  <span className="text-green font-bold">{selectedNode.status}</span>
                </div>
                <div>
                  <span className="text-dim">Transit Corridor: </span>
                  <span className="text-amber">{selectedNode.distance_next}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded border border-line2 bg-panel2 p-3 font-mono text-[10.5px] text-dim2 leading-relaxed">
            Click any camera node on the 2D schematic to inspect topological coordinate bounds and corridor links.
          </div>
        </div>
      </div>
    </div>
  );
}
