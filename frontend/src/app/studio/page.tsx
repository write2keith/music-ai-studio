"use client";

import { PromptBuilder } from "@/components/studio/PromptBuilder";
import { TrackCard } from "@/components/studio/TrackCard";

const recentTracks = [
  {
    id: "1", title: "Late Night Lo-Fi", artist: "You", genre: "Lo-Fi", mood: "Chill",
    bpm: 85, key: "Am", duration: 187, createdAt: "2026-08-04",
    status: "completed" as const, playCount: 124, likes: 23, hasStems: true,
  },
  {
    id: "2", title: "Trap Anthem WIP", artist: "You", genre: "Trap", mood: "Dark",
    bpm: 140, key: "Dm", duration: 92, createdAt: "2026-08-05",
    status: "draft" as const, playCount: 12, likes: 3, hasStems: false,
  },
  {
    id: "3", title: "Summer House Groove", artist: "You", genre: "House", mood: "Energetic",
    bpm: 126, key: "F", duration: 230, createdAt: "2026-08-03",
    status: "completed" as const, playCount: 89, likes: 15, hasStems: true,
  },
];

export default function StudioPage() {
  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Prompt Builder */}
        <div className="lg:col-span-1">
          <div className="sticky top-[88px]">
            <PromptBuilder />
          </div>
        </div>

        {/* Recent Tracks */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-daw-text">Recent Tracks</h2>
            <button className="text-xs text-daw-text-muted hover:text-daw-text transition-colors">
              View all
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentTracks.map((track) => (
              <TrackCard key={track.id} track={track} />
            ))}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total Tracks", value: "12", change: "+3" },
              { label: "Total Plays", value: "1,234", change: "+156" },
              { label: "Likes", value: "89", change: "+12" },
            ].map((stat) => (
              <div key={stat.label} className="glass rounded-xl p-4">
                <p className="text-xs text-daw-text-dim">{stat.label}</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-bold text-daw-text tabular-nums">{stat.value}</span>
                  <span className="text-[10px] text-daw-green">{stat.change}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
