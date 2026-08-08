"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TOOLS = [
  { href: "/tools/youtube", label: "YouTube", icon: "Fi" },
  { href: "/tools/compressor", label: "Compressor", icon: "Sz" },
  { href: "/tools/note-detection", label: "Notes", icon: "Mi" },
  { href: "/tools/vocal-remover", label: "Vocal Remover", icon: "Sc" },
  { href: "/tools/chord-detection", label: "Chords", icon: "Mu" },
  { href: "/tools/guitar-tab", label: "Guitar Tab", icon: "Ta" },
  { href: "/tools/pitch-tempo", label: "Pitch & Tempo", icon: "Pt" },
  { href: "/tools/lyrics", label: "Lyrics", icon: "Ly" },
  { href: "/tools/vocal-coach", label: "Vocal Coach", icon: "Vo" },
];

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TOOLS.map((tool) => {
          const isActive = pathname === tool.href;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                isActive
                  ? "bg-daw-accent/15 text-daw-accent border border-daw-accent/30"
                  : "bg-daw-surface-2 text-daw-text-dim hover:text-daw-text hover:bg-daw-surface-3 border border-transparent"
              )}
            >
              {tool.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
