import React from 'react';
import { Outlet } from "react-router-dom";
import TacticalSidebar from "./TacticalSidebar.jsx";
import CommandBar from "./CommandBar.jsx";

export default function TacticalShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-sentinel-900 text-ink">
      <TacticalSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <CommandBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}