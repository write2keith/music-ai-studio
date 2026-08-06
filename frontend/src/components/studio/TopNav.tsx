"use client";

import { Search, Bell, Settings, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";

export function TopNav({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header className="h-14 bg-daw-surface/80 backdrop-blur-xl border-b border-daw-border flex items-center px-4 gap-3 sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-daw-text-muted hover:text-daw-text hover:bg-daw-surface-3 transition-colors"
      >
        <Menu className="w-4 h-4" />
      </button>

      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-daw-text-dim" />
        <input
          type="text"
          placeholder="Search tracks, artists, projects..."
          className="w-full bg-daw-surface-3 border border-daw-border rounded-lg pl-9 pr-4 py-2 text-xs text-daw-text placeholder-daw-text-dim focus:outline-none focus:border-daw-accent/50 transition-colors"
        />
      </div>

      <div className="flex items-center gap-1">
        <IconButton>
          <Bell className="w-4 h-4" />
        </IconButton>
        <IconButton>
          <Settings className="w-4 h-4" />
        </IconButton>

        <div className="ml-2 flex items-center gap-2.5 pl-2 border-l border-daw-border">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-daw-accent to-daw-cyan flex items-center justify-center text-[10px] font-bold text-white">
            K
          </div>
          <span className="text-xs font-medium text-daw-text hidden sm:block">Keith</span>
        </div>
      </div>
    </header>
  );
}
