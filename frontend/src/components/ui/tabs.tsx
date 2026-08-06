"use client";

import { cn } from "@/lib/utils";

interface TabsProps {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex gap-0.5 p-0.5 bg-daw-surface rounded-lg", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all",
            active === tab.id
              ? "bg-daw-surface-3 text-daw-text shadow-sm"
              : "text-daw-text-muted hover:text-daw-text"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              active === tab.id ? "bg-daw-accent/20 text-daw-accent" : "bg-daw-surface-2 text-daw-text-dim"
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
